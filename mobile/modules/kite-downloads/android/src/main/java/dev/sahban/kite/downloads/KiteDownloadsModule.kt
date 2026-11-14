package dev.sahban.kite.downloads

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException

class KiteDownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KiteDownloads")
    Constant("isSupported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q }

    AsyncFunction("saveImageAsync") Coroutine { sourceUri: String, fileName: String, mimeType: String ->
      withContext(Dispatchers.IO) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
          throw IllegalStateException("MediaStore Downloads requires Android 10.")
        }
        val context = appContext.reactContext ?: throw IOException("Kite is unavailable.")
        val source = Uri.parse(sourceUri)
        require(source.scheme == "file" && source.authority.isNullOrEmpty() && source.query == null && source.fragment == null) { "Invalid image source." }
        val file = File(requireNotNull(source.path)).canonicalFile
        val cacheRoot = context.cacheDir.canonicalPath + File.separator
        require(file.path.startsWith(cacheRoot) && file.isFile && file.length() > 0) { "Image must be a downloaded cache file." }
        require(Regex("^kite-[0-9]+-[0-9]+\\.(png|jpg|gif|webp|bmp|tiff|avif|heic|heif)$").matches(fileName)) { "Invalid image filename." }
        val expectedMime = mapOf(
          "png" to "image/png", "jpg" to "image/jpeg", "gif" to "image/gif",
          "webp" to "image/webp", "bmp" to "image/bmp", "tiff" to "image/tiff",
          "avif" to "image/avif", "heic" to "image/heic", "heif" to "image/heif"
        )[fileName.substringAfterLast('.')]
        require(mimeType == expectedMime) { "Invalid image type." }

        val resolver = context.contentResolver
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, fileName)
          put(MediaStore.Downloads.MIME_TYPE, mimeType)
          put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Kite")
          put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val destination = resolver.insert(collection, values) ?: throw IOException("Could not create download.")
        var published = false
        try {
          file.inputStream().use { input ->
            val output = resolver.openOutputStream(destination, "w") ?: throw IOException("Could not write download.")
            output.use {
              val buffer = ByteArray(64 * 1024)
              while (true) {
                ensureActive()
                val count = input.read(buffer)
                if (count < 0) break
                it.write(buffer, 0, count)
              }
            }
          }
          ensureActive()
          values.clear()
          values.put(MediaStore.Downloads.IS_PENDING, 0)
          if (resolver.update(destination, values, null, null) != 1) throw IOException("Could not finish download.")
          published = true
          destination.toString()
        } finally {
          // Failed or cancelled exports must not leave an empty/partial download.
          if (!published) runCatching { resolver.delete(destination, null, null) }
        }
      }
    }
  }
}
