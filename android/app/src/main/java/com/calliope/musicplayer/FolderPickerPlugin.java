package com.calliope.musicplayer;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(name = "FolderPicker")
public class FolderPickerPlugin extends Plugin {

    private static final String PREFS_NAME = "CalliopePrefs";
    private static final String PREF_FOLDER_URI = "music_folder_uri";

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPickerResult");
    }

    @ActivityCallback
    public void folderPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() == Activity.RESULT_OK) {
            Intent data = result.getData();
            if (data != null) {
                Uri uri = data.getData();
                if (uri != null) {
                    getContext().getContentResolver().takePersistableUriPermission(
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                    
                    SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(PREF_FOLDER_URI, uri.toString()).apply();
                    
                    JSObject ret = new JSObject();
                    ret.put("uri", uri.toString());
                    call.resolve(ret);
                    return;
                }
            }
        }
        call.reject("No folder selected");
    }

    @PluginMethod
    public void getSavedFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uriStr = prefs.getString(PREF_FOLDER_URI, null);
        JSObject ret = new JSObject();
        ret.put("uri", uriStr);
        call.resolve(ret);
    }

    @PluginMethod
    public void listAudioFiles(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            uriStr = prefs.getString(PREF_FOLDER_URI, null);
        }

        if (uriStr == null) {
            call.reject("No folder URI provided or saved");
            return;
        }

        Uri treeUri = Uri.parse(uriStr);
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        
        if (root == null || !root.exists() || !root.isDirectory()) {
            call.reject("Invalid or inaccessible folder URI");
            return;
        }

        JSArray files = new JSArray();
        traverseDirectory(root, files);

        JSObject ret = new JSObject();
        ret.put("files", files);
        call.resolve(ret);
    }

    private void traverseDirectory(DocumentFile dir, JSArray files) {
        DocumentFile[] children = dir.listFiles();
        for (DocumentFile file : children) {
            if (file.isDirectory()) {
                traverseDirectory(file, files);
            } else {
                String name = file.getName();
                if (name != null) {
                    String lowerName = name.toLowerCase();
                    if (lowerName.endsWith(".mp3") || lowerName.endsWith(".flac") ||
                        lowerName.endsWith(".wav") || lowerName.endsWith(".ogg") ||
                        lowerName.endsWith(".m4a") || lowerName.endsWith(".aac") ||
                        lowerName.endsWith(".wma") || lowerName.endsWith(".opus")) {
                        
                        JSObject fileObj = new JSObject();
                        fileObj.put("name", name);
                        fileObj.put("uri", file.getUri().toString());
                        fileObj.put("mimeType", file.getType());
                        fileObj.put("size", file.length());
                        files.put(fileObj);
                    }
                }
            }
        }
    }

    @PluginMethod
    public void readFileAsBase64(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("URI is required");
            return;
        }

        Uri uri = Uri.parse(uriStr);
        try (InputStream inputStream = getContext().getContentResolver().openInputStream(uri)) {
            if (inputStream == null) {
                call.reject("Failed to open input stream for URI");
                return;
            }

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            int nRead;
            byte[] data = new byte[16384];
            while ((nRead = inputStream.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, nRead);
            }

            buffer.flush();
            byte[] audioBytes = buffer.toByteArray();
            String base64 = Base64.encodeToString(audioBytes, Base64.NO_WRAP);

            DocumentFile file = DocumentFile.fromSingleUri(getContext(), uri);
            String name = file != null ? file.getName() : "unknown";
            String mimeType = file != null ? file.getType() : getContext().getContentResolver().getType(uri);

            JSObject ret = new JSObject();
            ret.put("data", base64);
            ret.put("name", name);
            ret.put("mimeType", mimeType);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to read file", e);
        }
    }

    @PluginMethod
    public void clearSavedFolder(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(PREF_FOLDER_URI).apply();
        
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
