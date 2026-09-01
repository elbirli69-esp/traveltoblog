package com.traveltoblog.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

public class ShareIntentHandler {

    private final Context context;
    private final String serverUrl;

    public ShareIntentHandler(Context context) {
        this.context = context.getApplicationContext();
        this.serverUrl = loadServerUrl();
    }

    public String getServerUrl() {
        return serverUrl;
    }

    public String uploadAndGetRedirectUrl(List<Uri> uris) throws Exception {
        boolean allowOriginalMedia = hasMediaLocationPermission();
        List<File> files = new ArrayList<>();
        List<String> names = new ArrayList<>();
        List<String> mimeTypes = new ArrayList<>();

        for (Uri uri : uris) {
            ImageImportHelper.ImportedImage image =
                ImageImportHelper.importUri(context, uri, allowOriginalMedia);
            if (image == null) {
                continue;
            }
            files.add(image.file);
            names.add(image.name);
            mimeTypes.add(image.mimeType);
        }

        if (files.isEmpty()) {
            throw new Exception("No valid images to share");
        }

        String boundary = "----TravelToBlog" + System.currentTimeMillis();
        HttpURLConnection connection =
            (HttpURLConnection) new URL(serverUrl + "/api/share-target").openConnection();
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(30_000);
        connection.setReadTimeout(120_000);
        connection.setRequestProperty(
            "Content-Type",
            "multipart/form-data; boundary=" + boundary
        );

        try (OutputStream rawOut = connection.getOutputStream();
            PrintWriter writer =
                new PrintWriter(new OutputStreamWriter(rawOut, StandardCharsets.UTF_8), true)) {
            for (int i = 0; i < files.size(); i++) {
                writer.append("--").append(boundary).append("\r\n");
                writer
                    .append("Content-Disposition: form-data; name=\"photos\"; filename=\"")
                    .append(names.get(i))
                    .append("\"\r\n");
                writer.append("Content-Type: ").append(mimeTypes.get(i)).append("\r\n\r\n");
                writer.flush();

                try (FileInputStream input = new FileInputStream(files.get(i))) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        rawOut.write(buffer, 0, read);
                    }
                }
                rawOut.flush();
                writer.append("\r\n");
            }
            writer.append("--").append(boundary).append("--\r\n");
            writer.flush();
        }

        int status = connection.getResponseCode();
        if (status == HttpURLConnection.HTTP_SEE_OTHER || status == HttpURLConnection.HTTP_MOVED_TEMP) {
            String location = connection.getHeaderField("Location");
            if (location != null && !location.isEmpty()) {
                return location;
            }
        }

        throw new Exception("Share upload failed with status " + status);
    }

    private boolean hasMediaLocationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return true;
        }
        return (
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_MEDIA_LOCATION
            ) ==
            PackageManager.PERMISSION_GRANTED
        );
    }

    private String loadServerUrl() {
        try (InputStream input = context.getAssets().open("capacitor.config.json");
            BufferedReader reader =
                new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            StringBuilder json = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                json.append(line);
            }
            JSONObject config = new JSONObject(json.toString());
            JSONObject server = config.optJSONObject("server");
            if (server != null) {
                String url = server.optString("url", "").trim();
                if (!url.isEmpty()) {
                    return url.replaceAll("/$", "");
                }
            }
        } catch (Exception ignored) {
            // Fall back to default below.
        }
        return "https://syno-nas.tailf9872a.ts.net";
    }
}
