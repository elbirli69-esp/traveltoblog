package com.traveltoblog.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "PhotoExif",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES }, alias = "photos"),
        @Permission(
            strings = { Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED },
            alias = "photospartial"
        ),
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage"),
        @Permission(strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }, alias = "medialocation")
    }
)
public class PhotoExifPlugin extends Plugin {

    private static final int MAX_READ_BYTES = 25 * 1024 * 1024;

    @PluginMethod
    public void ping(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void pickImages(PluginCall call) {
        if (!ensurePhotoPermission(call)) {
            return;
        }
        launchPicker(call);
    }

    @PluginMethod
    public void readPhotoFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Ruta de archivo requerida");
            return;
        }

        try {
            File file = new File(path);
            File cacheDir = getContext().getCacheDir().getCanonicalFile();
            if (!file.getCanonicalFile().getPath().startsWith(cacheDir.getPath())) {
                call.reject("Ruta de archivo no permitida");
                return;
            }
            if (!file.exists() || !file.isFile()) {
                call.reject("Archivo no encontrado");
                return;
            }
            if (file.length() > MAX_READ_BYTES) {
                call.reject("La foto es demasiado grande (máx. 25 MB)");
                return;
            }

            String mimeType = guessMimeType(file.getName());
            JSObject ret = new JSObject();
            ret.put("base64", readFileBase64(file));
            ret.put("mimeType", mimeType);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo leer la foto", e);
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (!hasPhotoReadPermission()) {
            call.reject(
                "Permiso de fotos denegado. Ve a Ajustes → Apps → TravelToBlog → Permisos y activa Fotos."
            );
            return;
        }
        launchPicker(call);
    }

    /** Only photos/storage are required — medialocation is optional for GPS. */
    private boolean ensurePhotoPermission(PluginCall call) {
        if (hasPhotoReadPermission()) {
            return true;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("photos", call, "permissionCallback");
        } else {
            requestPermissionForAlias("storage", call, "permissionCallback");
        }
        return false;
    }

    private boolean hasPhotoReadPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionState photos = getPermissionState("photos");
            PermissionState partial = getPermissionState("photospartial");
            return photos == PermissionState.GRANTED || partial == PermissionState.GRANTED;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return (
                ContextCompat.checkSelfPermission(
                    getContext(),
                    Manifest.permission.READ_EXTERNAL_STORAGE
                ) ==
                PackageManager.PERMISSION_GRANTED
            );
        }
        return true;
    }

    private void launchPicker(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

            Intent chooser = Intent.createChooser(intent, "Seleccionar fotos");
            startActivityForResult(call, chooser, "handlePickerResult");
        } catch (Exception e) {
            call.reject("No se pudo abrir el selector de fotos", e);
        }
    }

    @ActivityCallback
    private void handlePickerResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject empty = new JSObject();
            empty.put("photos", new JSArray());
            call.resolve(empty);
            return;
        }

        List<Uri> uris = new ArrayList<>();
        Intent data = result.getData();
        if (data.getClipData() != null) {
            int count = data.getClipData().getItemCount();
            for (int i = 0; i < count; i++) {
                uris.add(data.getClipData().getItemAt(i).getUri());
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        JSArray photos = new JSArray();
        for (Uri uri : uris) {
            JSObject photo = processUri(uri);
            if (photo != null) {
                photos.put(photo);
            }
        }

        JSObject ret = new JSObject();
        ret.put("photos", photos);
        call.resolve(ret);
    }

    private JSObject processUri(Uri uri) {
        File cacheFile = null;
        try {
            Uri readUri = uri;
            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                getPermissionState("medialocation") == PermissionState.GRANTED
            ) {
                try {
                    readUri = MediaStore.setRequireOriginal(uri);
                } catch (Exception ignored) {
                    readUri = uri;
                }
            }

            String name = queryDisplayName(uri);
            if (name == null || name.isEmpty()) {
                name = "photo_" + System.currentTimeMillis() + ".jpg";
            }

            String mimeType = getContext().getContentResolver().getType(uri);
            if (mimeType == null) {
                mimeType = "image/jpeg";
            }

            cacheFile =
                new File(
                    getContext().getCacheDir(),
                    "picked_" + System.currentTimeMillis() + "_" + sanitize(name)
                );

            try {
                copyUriToFile(readUri, cacheFile);
            } catch (Exception first) {
                if (!readUri.equals(uri)) {
                    copyUriToFile(uri, cacheFile);
                } else {
                    throw first;
                }
            }

            Double latitude = null;
            Double longitude = null;
            String dateTime = null;
            boolean gpsStripped = false;

            ExifInterface exif = new ExifInterface(cacheFile.getAbsolutePath());
            float[] latLong = new float[2];
            if (exif.getLatLong(latLong)) {
                latitude = (double) latLong[0];
                longitude = (double) latLong[1];
            } else {
                gpsStripped = hasGpsIfdWithoutCoords(exif);
            }

            String exifDate = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
            if (exifDate == null) {
                exifDate = exif.getAttribute(ExifInterface.TAG_DATETIME);
            }
            if (exifDate != null) {
                dateTime = parseExifDate(exifDate);
            }

            String absolutePath = cacheFile.getAbsolutePath();
            String webPath = getBridge().getLocalUrl() + Bridge.CAPACITOR_FILE_START + absolutePath;

            JSObject obj = new JSObject();
            obj.put("name", name);
            obj.put("mimeType", mimeType);
            obj.put("path", absolutePath);
            obj.put("webPath", webPath);
            if (latitude != null) {
                obj.put("latitude", latitude);
            } else {
                obj.put("latitude", JSObject.NULL);
            }
            if (longitude != null) {
                obj.put("longitude", longitude);
            } else {
                obj.put("longitude", JSObject.NULL);
            }
            if (dateTime != null) {
                obj.put("dateTime", dateTime);
            } else {
                obj.put("dateTime", JSObject.NULL);
            }
            obj.put("gpsStripped", gpsStripped);

            return obj;
        } catch (Exception e) {
            if (cacheFile != null && cacheFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                cacheFile.delete();
            }
            return null;
        }
    }

    private String readFileBase64(File file) throws Exception {
        try (InputStream in = new java.io.FileInputStream(file);
            ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        }
    }

    private boolean hasGpsIfdWithoutCoords(ExifInterface exif) {
        String lat = exif.getAttribute(ExifInterface.TAG_GPS_LATITUDE);
        String lon = exif.getAttribute(ExifInterface.TAG_GPS_LONGITUDE);
        return (lat != null || lon != null);
    }

    private String parseExifDate(String raw) {
        try {
            SimpleDateFormat parser = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
            parser.setTimeZone(TimeZone.getDefault());
            Date parsed = parser.parse(raw);
            if (parsed == null) {
                return null;
            }
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US);
            iso.setTimeZone(TimeZone.getDefault());
            return iso.format(parsed);
        } catch (Exception e) {
            return null;
        }
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor =
                getContext()
                    .getContentResolver()
                    .query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    return cursor.getString(idx);
                }
            }
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return null;
    }

    private void copyUriToFile(Uri uri, File dest) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
            FileOutputStream out = new FileOutputStream(dest)) {
            if (in == null) {
                throw new Exception("Cannot open uri");
            }
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        }
    }

    private String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private String guessMimeType(String name) {
        String lower = name.toLowerCase(Locale.US);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".heic")) return "image/heic";
        if (lower.endsWith(".heif")) return "image/heif";
        return "image/jpeg";
    }
}
