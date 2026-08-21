import Foundation
import ScreenCaptureKit
import AVFoundation

// Captura el audio del sistema (lo que suena en el Mac) con ScreenCaptureKit
// y lo escribe como M4A/AAC. Uso: CapturaSistema <salida.m4a> [segundos]
// Sin segundos, graba hasta recibir SIGINT (Ctrl+C).

// Entradas de audio del equipo. Con el iPhone cerca y Continuity activo, su
// micrófono aparece aquí como una entrada más.
enum Micros {
    static func lista() -> [AVCaptureDevice] {
        var tipos: [AVCaptureDevice.DeviceType] = []
        if #available(macOS 14.0, *) { tipos = [.microphone, .external] }
        else { tipos = [.builtInMicrophone] }
        return AVCaptureDevice.DiscoverySession(deviceTypes: tipos, mediaType: .audio,
                                                position: .unspecified).devices
    }
    static func buscar(id: String) -> AVCaptureDevice? {
        return lista().first { $0.uniqueID == id }
    }
    static func comoJSON() -> String {
        let porDefecto = AVCaptureDevice.default(for: .audio)?.uniqueID
        let filas = lista().map { d -> [String: Any] in
            ["id": d.uniqueID, "nombre": d.localizedName, "porDefecto": d.uniqueID == porDefecto]
        }
        let datos = try? JSONSerialization.data(withJSONObject: filas, options: [.prettyPrinted])
        return datos.flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }
}

@available(macOS 13.0, *)
final class CapturaSistema: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private var archivo: AVAudioFile?
    private var archivoMic: AVAudioFile?
    private let ruta: URL
    private var microfonoID: String?
    private var muestrasEscritas: Int64 = 0
    private var muestrasMic: Int64 = 0
    private var picoSis: Float = 0
    private var picoMic: Float = 0
    private var ultimoReporte = Date()
    private var fallosEscritura = 0
    private var avisoFalloEnviado = false
    private var contadorReportes = 0
    private var rutaMic: URL { ruta.deletingPathExtension().appendingPathExtension("mic." + ruta.pathExtension) }

    init(ruta: URL, microfonoID: String? = nil) { self.ruta = ruta; self.microfonoID = microfonoID }

    // AAC a 64 kbps mono-equivalente: ~29 MB por hora en vez de ~1.4 GB en PCM
    static func ajustesAAC(_ formato: AVAudioFormat) -> [String: Any] {
        return [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: formato.sampleRate,
            AVNumberOfChannelsKey: formato.channelCount,
            AVEncoderBitRateKey: 64000
        ]
    }

    func iniciar() async throws {
        let contenido = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = contenido.displays.first else {
            throw NSError(domain: "captura", code: 1, userInfo: [NSLocalizedDescriptionKey: "sin displays"])
        }

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48000
        config.channelCount = 2
        // video al mínimo: ScreenCaptureKit exige stream de video aunque solo queramos audio
        config.width = 2; config.height = 2
        if #available(macOS 15.0, *) {
            config.captureMicrophone = true   // mic + sistema en el mismo stream, ya sincronizados
            // Sin dispositivo, ScreenCaptureKit usa la entrada por defecto del sistema.
            // Con él se puede grabar con el micrófono del iPhone (Continuity) o con
            // cualquier otra entrada, sin cambiar la configuración de todo el Mac.
            if let id = microfonoID, let dispositivo = Micros.buscar(id: id) {
                config.microphoneCaptureDeviceID = id
                FileHandle.standardError.write("MICROFONO \(dispositivo.localizedName)\n".data(using: .utf8)!)
            } else {
                if let id = microfonoID {
                    // El iPhone se fue, o se cambió de equipo: seguir con el de por
                    // defecto es mucho mejor que no grabar la reunión.
                    FileHandle.standardError.write("MICROFONO_AUSENTE \(id)\n".data(using: .utf8)!)
                }
                let porDefecto = AVCaptureDevice.default(for: .audio)?.localizedName ?? "el del sistema"
                FileHandle.standardError.write("MICROFONO \(porDefecto)\n".data(using: .utf8)!)
            }
        }
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let filtro = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let s = SCStream(filter: filtro, configuration: config, delegate: self)
        try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: DispatchQueue(label: "audio.sistema"))
        if #available(macOS 15.0, *) {
            try s.addStreamOutput(self, type: .microphone, sampleHandlerQueue: DispatchQueue(label: "audio.mic"))
        }
        let libres = Self.espacioLibreMB(ruta: ruta)
        if libres >= 0 && libres < 300 {
            throw NSError(domain: "captura", code: 2, userInfo: [NSLocalizedDescriptionKey:
                "Espacio insuficiente: quedan \(libres) MB. Una hora de reunión ocupa unos 130 MB."])
        }
        if libres >= 0 && libres < 2048 {
            FileHandle.standardError.write("DISCO \(libres)\n".data(using: .utf8)!)
        }
        try await s.startCapture()
        self.stream = s
        FileHandle.standardError.write("captura iniciada\n".data(using: .utf8)!)
    }

    func detener() async {
        try? await stream?.stopCapture()
        archivo = nil
        archivoMic = nil
        var msg = "sistema: \(muestrasEscritas) muestras | micrófono: \(muestrasMic) muestras\n"
        if fallosEscritura > 0 {
            msg += "ATENCION: \(fallosEscritura) bloques de audio NO se pudieron escribir\n"
        }
        FileHandle.standardError.write(msg.data(using: .utf8)!)
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard sampleBuffer.isValid else { return }
        if #available(macOS 15.0, *), type == .microphone {
            escribirMic(sampleBuffer); return
        }
        guard type == .audio else { return }
        guard let descripcion = sampleBuffer.formatDescription?.audioStreamBasicDescription else { return }

        var asbd = descripcion
        guard let formato = AVAudioFormat(streamDescription: &asbd) else { return }

        if archivo == nil {
            do {
                archivo = try AVAudioFile(forWriting: ruta, settings: Self.ajustesAAC(formato),
                                          commonFormat: formato.commonFormat, interleaved: formato.isInterleaved)
            } catch {
                registrarFalloEscritura(error)   // con el disco lleno, falla aquí, no al escribir
            }
        }
        guard let archivo else { return }

        try? sampleBuffer.withAudioBufferList { lista, _ in
            guard let pcm = AVAudioPCMBuffer(pcmFormat: formato, bufferListNoCopy: lista.unsafePointer) else { return }
            // El contador solo sube si el disco aceptó el bloque: si no, mentiría.
            do {
                try archivo.write(from: pcm)
                muestrasEscritas += Int64(pcm.frameLength)
            } catch {
                registrarFalloEscritura(error)
            }
            picoSis = max(picoSis, Self.pico(pcm))
            reportarNiveles()
        }
    }

    private func escribirMic(_ sampleBuffer: CMSampleBuffer) {
        guard let d = sampleBuffer.formatDescription?.audioStreamBasicDescription else { return }
        var asbd = d
        guard let formato = AVAudioFormat(streamDescription: &asbd) else { return }
        if archivoMic == nil {
            do {
                archivoMic = try AVAudioFile(forWriting: rutaMic, settings: Self.ajustesAAC(formato),
                                             commonFormat: formato.commonFormat, interleaved: formato.isInterleaved)
            } catch {
                registrarFalloEscritura(error)
            }
        }
        guard let archivoMic else { return }
        try? sampleBuffer.withAudioBufferList { lista, _ in
            guard let pcm = AVAudioPCMBuffer(pcmFormat: formato, bufferListNoCopy: lista.unsafePointer) else { return }
            do {
                try archivoMic.write(from: pcm)
                muestrasMic += Int64(pcm.frameLength)
            } catch {
                registrarFalloEscritura(error)
            }
            picoMic = max(picoMic, Self.pico(pcm))
            reportarNiveles()
        }
    }

    // Una grabación que falla en silencio es peor que una que no arranca:
    // el usuario cree que tiene la junta y se entera al final. Se avisa al instante.
    private func registrarFalloEscritura(_ error: Error) {
        fallosEscritura += 1
        guard !avisoFalloEnviado else { return }
        avisoFalloEnviado = true
        let libres = Self.espacioLibreMB(ruta: ruta)
        let motivo = libres < 500 ? "disco casi lleno (\(libres) MB libres)" : error.localizedDescription
        FileHandle.standardError.write("FALLO_ESCRITURA \(motivo)\n".data(using: .utf8)!)
    }

    static func espacioLibreMB(ruta: URL) -> Int {
        let dir = ruta.deletingLastPathComponent()
        if let v = try? dir.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
           let libres = v.volumeAvailableCapacityForImportantUsage {
            return Int(libres / 1_048_576)
        }
        return -1
    }

    // Pico absoluto del buffer, para el medidor de nivel de la interfaz
    static func pico(_ b: AVAudioPCMBuffer) -> Float {
        guard let datos = b.floatChannelData else { return 0 }
        var maximo: Float = 0
        for canal in 0..<Int(b.format.channelCount) {
            let p = datos[canal]
            for i in 0..<Int(b.frameLength) { maximo = max(maximo, abs(p[i])) }
        }
        return maximo
    }

    // Emite "NIVEL sis=0.42 mic=0.11" ~3 veces por segundo para que la app dibuje barras
    private func reportarNiveles() {
        let ahora = Date()
        guard ahora.timeIntervalSince(ultimoReporte) > 0.3 else { return }
        ultimoReporte = ahora
        let linea = String(format: "NIVEL sis=%.3f mic=%.3f\n", picoSis, picoMic)
        FileHandle.standardError.write(linea.data(using: .utf8)!)
        picoSis = 0; picoMic = 0

        // vigilar el disco cada ~30 s (una hora de grabación ocupa unos 130 MB)
        contadorReportes += 1
        if contadorReportes % 100 == 0 {
            let libres = Self.espacioLibreMB(ruta: ruta)
            if libres >= 0 && libres < 2048 {
                FileHandle.standardError.write("DISCO \(libres)\n".data(using: .utf8)!)
            }
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        FileHandle.standardError.write("stream detenido con error: \(error.localizedDescription)\n".data(using: .utf8)!)
    }
}

// ---- main ----
var args = Array(CommandLine.arguments.dropFirst())

// --micros: lista las entradas de audio en JSON y sale. Lo usa Ajustes.
if args.first == "--micros" {
    print(Micros.comoJSON())
    exit(0)
}

// --mic <uniqueID>: graba con esa entrada en vez de con la de por defecto.
var microfonoElegido: String? = nil
if let i = args.firstIndex(of: "--mic") {
    if i + 1 < args.count { microfonoElegido = args[i + 1]; args.removeSubrange(i...(i + 1)) }
    else { args.remove(at: i) }
}

guard args.count >= 1 else {
    print("Uso: CapturaSistema <salida.m4a> [segundos] [--mic <id>]")
    print("     CapturaSistema --micros")
    exit(2)
}
let salida = URL(fileURLWithPath: args[0])
let segundos = args.count >= 2 ? Double(args[1]) ?? 0 : 0

if #available(macOS 13.0, *) {
    let cap = CapturaSistema(ruta: salida, microfonoID: microfonoElegido)
    let sem = DispatchSemaphore(value: 0)

    // Manejar SIGINT y SIGTERM: el script lanzador usa SIGTERM porque un `trap` de
    // bash sobre INT se hereda como SIG_IGN y dejaría sordo al manejador.
    signal(SIGINT, SIG_IGN)
    signal(SIGTERM, SIG_IGN)
    // OJO: la cola NO puede ser .main — el hilo principal queda bloqueado en sem.wait()
    // y el handler nunca se dispararía. Cola global.
    let colaSenales = DispatchQueue(label: "senales")
    let fInt = DispatchSource.makeSignalSource(signal: SIGINT, queue: colaSenales)
    fInt.setEventHandler { Task { await cap.detener(); sem.signal() } }
    fInt.resume()
    let fTerm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: colaSenales)
    fTerm.setEventHandler { Task { await cap.detener(); sem.signal() } }
    fTerm.resume()

    Task {
        do {
            try await cap.iniciar()
            if segundos > 0 {
                try await Task.sleep(nanoseconds: UInt64(segundos * 1_000_000_000))
                await cap.detener()
                sem.signal()
            }
        } catch {
            FileHandle.standardError.write("ERROR: \(error.localizedDescription)\n".data(using: .utf8)!)
            exit(1)
        }
    }
    sem.wait()
    print("listo: \(salida.path)")
} else {
    print("requiere macOS 13+"); exit(1)
}
