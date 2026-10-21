package expo.modules.aetherwarehouse

import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.CookieManager
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayOutputStream

class AetherWarehouseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AetherWarehouse")
    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext ?: throw IllegalStateException("No se pudo acceder a la cámara")
      if (!uri.startsWith("file://")) throw IllegalArgumentException("Solo se leen fotos locales")
      val image = InputImage.fromFilePath(context, Uri.parse(uri))
      // Modelo empaquetado en la app: no necesita Google Play ni una descarga inicial.
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image).addOnSuccessListener { text ->
        recognizer.close()
        promise.resolve(text.text)
      }.addOnFailureListener { error ->
        recognizer.close()
        promise.reject("OCR_FAILED", "No se pudo leer la etiqueta", error)
      }
    }
    AsyncFunction("request") { path: String, body: String? ->
      val context = appContext.reactContext ?: throw IllegalStateException("Aplicación no disponible")
      val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      val origin = info.metaData.getString("cl.aether.bodega.PLATFORM_URL") ?: ""
      val base = URL(origin)
      if (base.protocol != "https" || base.userInfo != null || base.query != null || (base.path != "" && base.path != "/")) throw IllegalArgumentException("Configura el dominio HTTPS de Aether")
      val allowed = path.startsWith("/api/warehouse/") || path == "/api/auth/signout"
      if (!allowed || path.contains("\\") || path.contains("..") || path.contains("#")) throw IllegalArgumentException("Ruta no permitida")
      val target = URL(base, path)
      if (target.host != base.host || target.port != base.port) throw IllegalArgumentException("Dominio no permitido")
      val connection = target.openConnection() as HttpURLConnection
      try {
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 15000
        connection.readTimeout = 90000
        connection.requestMethod = if (body == null) "GET" else "POST"
        connection.setRequestProperty("Origin", origin)
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("User-Agent", "AetherWarehouse/1.0 Android")
        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.getCookie(target.toString())?.let { connection.setRequestProperty("Cookie", it) }
        if (body != null) {
          if (body.toByteArray(Charsets.UTF_8).size > 128000) throw IllegalArgumentException("Demasiados registros")
          connection.doOutput = true
          connection.setRequestProperty("Content-Type", "application/json")
          connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val status = connection.responseCode
        connection.headerFields.filterKeys { it?.equals("Set-Cookie", true) == true }.values.flatten().forEach { cookies.setCookie(origin, it) }
        cookies.flush()
        val stream = if (status >= 400) connection.errorStream else connection.inputStream
        val output = ByteArrayOutputStream()
        stream?.use {
          val buffer = ByteArray(8192)
          while (true) {
            val count = it.read(buffer)
            if (count < 0) break
            if (output.size() + count > 16 * 1024 * 1024) throw IllegalStateException("Respuesta demasiado grande")
            output.write(buffer, 0, count)
          }
        }
        // Las cookies httpOnly permanecen en el almacén nativo y nunca pasan a JS.
        mapOf("status" to status, "body" to output.toString("UTF-8"))
      } finally { connection.disconnect() }
    }
  }
}
