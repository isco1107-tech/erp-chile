import ExpoModulesCore
import MLKitTextRecognition
import MLKitVision
import WebKit
import UIKit

public class AetherWarehouseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AetherWarehouse")
    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL, let image = UIImage(contentsOfFile: url.path) else {
        promise.reject("INVALID_PHOTO", "Solo se leen fotos locales")
        return
      }
      let vision = VisionImage(image: image)
      vision.orientation = image.imageOrientation
      let recognizer = TextRecognizer.textRecognizer(options: TextRecognizerOptions())
      recognizer.process(vision) { result, error in
        if let error = error { promise.reject("OCR_FAILED", "No se pudo leer la etiqueta", error); return }
        promise.resolve(result?.text ?? "")
      }
    }
    AsyncFunction("request") { (path: String, body: String?, promise: Promise) in
      guard let raw = Bundle.main.object(forInfoDictionaryKey: "AetherPlatformURL") as? String,
            let origin = URL(string: raw), origin.scheme == "https", origin.user == nil, origin.password == nil,
            origin.query == nil, origin.fragment == nil, origin.path.isEmpty || origin.path == "/",
            (path.hasPrefix("/api/warehouse/") || path == "/api/auth/signout"),
            !path.contains(".."), !path.contains("\\"), !path.contains("#"),
            let url = URL(string: path, relativeTo: origin)?.absoluteURL, url.host == origin.host, url.port == origin.port else {
        promise.reject("INVALID_ORIGIN", "Configura el dominio HTTPS de Aether")
        return
      }
      DispatchQueue.main.async {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
          let configuration = URLSessionConfiguration.ephemeral
          configuration.httpCookieStorage = HTTPCookieStorage.shared
          configuration.httpShouldSetCookies = true
          configuration.timeoutIntervalForRequest = 90
          for cookie in cookies where url.host == cookie.domain || url.host?.hasSuffix("." + cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) == true {
            configuration.httpCookieStorage?.setCookie(cookie)
          }
          var request = URLRequest(url: url)
          request.httpMethod = body == nil ? "GET" : "POST"
          request.setValue(raw, forHTTPHeaderField: "Origin")
          request.setValue("application/json", forHTTPHeaderField: "Accept")
          request.setValue("AetherWarehouse/1.0 iOS", forHTTPHeaderField: "User-Agent")
          if let body = body {
            guard body.utf8.count <= 128000 else { promise.reject("TOO_LARGE", "Demasiados registros"); return }
            request.httpBody = body.data(using: .utf8)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
          }
          let delegate = WarehouseNoRedirect()
          let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
          session.dataTask(with: request) { data, response, error in
            defer { session.finishTasksAndInvalidate() }
            if let error = error { promise.reject("NETWORK_FAILED", "No se pudo conectar con Aether", error); return }
            guard let response = response as? HTTPURLResponse, let data = data, data.count <= 16 * 1024 * 1024 else {
              promise.reject("INVALID_RESPONSE", "No se pudo leer la respuesta de Aether"); return
            }
            // Actualizar el almacén del WebView, sin devolver cabeceras de sesión a JS.
            let nativeCookies = HTTPCookie.cookies(withResponseHeaderFields: response.allHeaderFields.reduce(into: [String: String]()) { result, entry in if let name = entry.key as? String, let value = entry.value as? String { result[name] = value } }, for: url)
            DispatchQueue.main.async {
              let group = DispatchGroup()
              for cookie in nativeCookies { group.enter(); WKWebsiteDataStore.default().httpCookieStore.setCookie(cookie) { group.leave() } }
              group.notify(queue: .main) { promise.resolve(["status": response.statusCode, "body": String(data: data, encoding: .utf8) ?? ""]) }
            }
          }.resume()
        }
      }
    }
  }
}

private final class WarehouseNoRedirect: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
