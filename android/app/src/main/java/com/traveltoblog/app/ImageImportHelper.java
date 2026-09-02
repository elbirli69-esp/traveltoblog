package com.traveltoblog.app;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import androidx.exifinterface.media.ExifInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public final class ImageImportHelper {

    private ImageImportHelper() {}

    public static final class ImportedImage {
        public final String name;
        public final String mimeType;
        public final File file;
        public final Double latitude;
        public final Double longitude;
        public final String dateTime;
        public final boolean gpsStripped;

        ImportedImage(
            String name,
            String mimeType,
            File file,
            Double latitude,
            Double longitude,
            String dateTime,
            boolean gpsStripped
        ) {
            this.name = name;
            this.mimeType = mimeType;
            this.file = file;
            this.latitude = latitude;
            this.longitude = longitude;
            this.dateTime = dateTime;
            this.gpsStripped = gpsStripped;
        }
    }

    public static ImportedImage importFile(File file, boolean allowOriginalMedia) {
        if (file == null || !file.exists() || !file.isFile()) {
            return null;
        }

        try {
            String name = file.getName();
            String mimeType = guessMimeType(name);

            Double latitude = null;
            Double longitude = null;
            String dateTime = null;
            boolean gpsStripped = false;

            ExifInterface exif = new ExifInterface(file.getAbsolutePath());
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

            return new ImportedImage(
                name,
                mimeType,
                file,
                latitude,
                longitude,
                dateTime,
                gpsStripped
            );
        } catch (Exception e) {
            return null;
        }
    }

    public static ImportedImage importUri(Context context, Uri uri, boolean allowOriginalMedia) {
        File cacheFile = null;
        try {
            Uri readUri = uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && allowOriginalMedia) {
                try {
                    readUri = MediaStore.setRequireOriginal(uri);
                } catch (Exception ignored) {
                    readUri = uri;
                }
            }

            String name = queryDisplayName(context, uri);
            if (name == null || name.isEmpty()) {
                name = "photo_" + System.currentTimeMillis() + ".jpg";
            }

            String mimeType = context.getContentResolver().getType(uri);
            if (mimeType == null) {
                mimeType = guessMimeType(name);
            }

            cacheFile =
                new File(
                    context.getCacheDir(),
                    "imported_" + System.currentTimeMillis() + "_" + sanitize(name)
                );

            try {
                copyUriToFile(context, readUri, cacheFile);
            } catch (Exception first) {
                if (!readUri.equals(uri)) {
                    copyUriToFile(context, uri, cacheFile);
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

            return new ImportedImage(
                name,
                mimeType,
                cacheFile,
                latitude,
                longitude,
                dateTime,
                gpsStripped
            );
        } catch (Exception e) {
            if (cacheFile != null && cacheFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                cacheFile.delete();
            }
            return null;
        }
    }

    private static boolean hasGpsIfdWithoutCoords(ExifInterface exif) {
        String lat = exif.getAttribute(ExifInterface.TAG_GPS_LATITUDE);
        String lon = exif.getAttribute(ExifInterface.TAG_GPS_LONGITUDE);
        return lat != null || lon != null;
    }

    private static String parseExifDate(String raw) {
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

    private static String queryDisplayName(Context context, Uri uri) {
        Cursor cursor = null;
        try {
            cursor =
                context
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

    private static void copyUriToFile(Context context, Uri uri, File dest) throws Exception {
        try (InputStream in = context.getContentResolver().openInputStream(uri);
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

    static String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    static String guessMimeType(String name) {
        String lower = name.toLowerCase(Locale.US);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".heic")) return "image/heic";
        if (lower.endsWith(".heif")) return "image/heif";
        return "image/jpeg";
    }
}
