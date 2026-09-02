package com.traveltoblog.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
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
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "PhotoExif",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_MEDIA_IMAGES }, alias = "photos"),
        @Permission(
            strings = { Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED },
            alias = "photospartial"
        ),
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage"),
        @Permission(strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }, alias = "medialocation"),
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
    }
)
public class PhotoExifPlugin extends Plugin {

    private static final int MAX_READ_BYTES = 25 * 1024 * 1024;

    private File cameraOutputFile;

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
    public void takePhoto(PluginCall call) {
        if (!ensureCameraPermission(call)) {
            return;
        }
        launchCamera(call);
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

            String mimeType = ImageImportHelper.guessMimeType(file.getName());
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

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (!hasCameraPermission()) {
            call.reject(
                "Permiso de cámara denegado. Ve a Ajustes → Apps → TravelToBlog → Permisos y activa Cámara."
            );
            return;
        }
        launchCamera(call);
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

    private boolean ensureCameraPermission(PluginCall call) {
        if (hasCameraPermission()) {
            return true;
        }
        requestPermissionForAlias("camera", call, "cameraPermissionCallback");
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

    private boolean hasCameraPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return (
                ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA) ==
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

            startActivityForResult(call, intent, "handlePickerResult");
        } catch (Exception e) {
            call.reject("No se pudo abrir el selector de fotos", e);
        }
    }

    private void launchCamera(PluginCall call) {
        try {
            File photoFile =
                new File(
                    getContext().getCacheDir(),
                    "camera_" + System.currentTimeMillis() + ".jpg"
                );
            cameraOutputFile = photoFile;

            Uri outputUri =
                FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    photoFile
                );

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, outputUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            startActivityForResult(call, intent, "handleCameraResult");
        } catch (Exception e) {
            cameraOutputFile = null;
            call.reject("No se pudo abrir la cámara", e);
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

    @ActivityCallback
    private void handleCameraResult(PluginCall call, ActivityResult result) {
        File outputFile = cameraOutputFile;
        cameraOutputFile = null;

        if (
            result.getResultCode() != Activity.RESULT_OK ||
            outputFile == null ||
            !outputFile.exists() ||
            outputFile.length() == 0
        ) {
            if (outputFile != null && outputFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                outputFile.delete();
            }
            JSObject empty = new JSObject();
            empty.put("photos", new JSArray());
            call.resolve(empty);
            return;
        }

        JSObject photo = processFile(outputFile);
        JSArray photos = new JSArray();
        if (photo != null) {
            photos.put(photo);
        }

        JSObject ret = new JSObject();
        ret.put("photos", photos);
        call.resolve(ret);
    }

    private JSObject processUri(Uri uri) {
        boolean allowOriginalMedia =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("medialocation") == PermissionState.GRANTED;

        ImageImportHelper.ImportedImage image =
            ImageImportHelper.importUri(getContext(), uri, allowOriginalMedia);
        if (image == null) {
            return null;
        }

        return buildPhotoObject(image);
    }

    private JSObject processFile(File file) {
        boolean allowOriginalMedia =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("medialocation") == PermissionState.GRANTED;

        ImageImportHelper.ImportedImage image =
            ImageImportHelper.importFile(file, allowOriginalMedia);
        if (image == null) {
            return null;
        }

        return buildPhotoObject(image);
    }

    private JSObject buildPhotoObject(ImageImportHelper.ImportedImage image) {
        String absolutePath = image.file.getAbsolutePath();
        String webPath = getBridge().getLocalUrl() + Bridge.CAPACITOR_FILE_START + absolutePath;

        JSObject obj = new JSObject();
        obj.put("name", image.name);
        obj.put("mimeType", image.mimeType);
        obj.put("path", absolutePath);
        obj.put("webPath", webPath);
        if (image.latitude != null) {
            obj.put("latitude", image.latitude);
        } else {
            obj.put("latitude", JSObject.NULL);
        }
        if (image.longitude != null) {
            obj.put("longitude", image.longitude);
        } else {
            obj.put("longitude", JSObject.NULL);
        }
        if (image.dateTime != null) {
            obj.put("dateTime", image.dateTime);
        } else {
            obj.put("dateTime", JSObject.NULL);
        }
        obj.put("gpsStripped", image.gpsStripped);

        return obj;
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
}
