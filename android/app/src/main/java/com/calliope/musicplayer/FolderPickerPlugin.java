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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

@CapacitorPlugin(name = "FolderPicker")
public class FolderPickerPlugin extends Plugin {

    private static final String PREFS_NAME = "CalliopePrefs";
    private static final String PREF_FOLDER_URI = "music_folder_uri";

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
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
                    int grantFlags = data.getFlags()
                            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                    if ((grantFlags & Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0) {
                        call.reject("The selected folder did not grant read permission");
                        return;
                    }
                    boolean canWrite = (grantFlags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0;
                    try {
                        getContext().getContentResolver().takePersistableUriPermission(uri, grantFlags);
                    } catch (SecurityException e) {
                        canWrite = false;
                        try {
                            getContext().getContentResolver().takePersistableUriPermission(
                                    uri,
                                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                            );
                        } catch (SecurityException readError) {
                            call.reject("Could not retain access to the selected folder", readError);
                            return;
                        }
                    }
                    
                    SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    String profileId = call.getString("profileId");
                    prefs.edit()
                            .putString(folderPreferenceKey(profileId), uri.toString())
                            .putBoolean(writePermissionKey(profileId), canWrite)
                            .apply();
                    
                    JSObject ret = new JSObject();
                    ret.put("uri", uri.toString());
                    ret.put("canWrite", canWrite);
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
        String profileId = call.getString("profileId");
        String uriStr = prefs.getString(folderPreferenceKey(profileId), null);
        if (uriStr == null && profileId != null) {
            uriStr = prefs.getString(PREF_FOLDER_URI, null);
        }
        JSObject ret = new JSObject();
        ret.put("uri", uriStr);
        ret.put("canWrite", isSafeProfileId(profileId)
                ? prefs.getBoolean(writePermissionKey(profileId), false)
                : prefs.getBoolean(writePermissionKey(null), false));
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
        String profileId = call.getString("profileId");
        prefs.edit()
                .remove(folderPreferenceKey(profileId))
                .remove(writePermissionKey(profileId))
                .apply();
        
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void writeProfileData(PluginCall call) {
        String uriStr = call.getString("uri");
        String profileId = call.getString("profileId");
        String profileName = call.getString("profileName");
        String content = call.getString("content");

        if (uriStr == null || !isSafeProfileId(profileId) || !isSafeDirectoryName(profileName) || content == null) {
            call.reject("Invalid profile data request");
            return;
        }
        if (content.getBytes(StandardCharsets.UTF_8).length > 25 * 1024 * 1024) {
            call.reject("Profile data exceeds the maximum size");
            return;
        }

        DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(uriStr));
        if (root == null || !root.exists() || !root.isDirectory() || !root.canWrite()) {
            call.reject("Selected folder is not writable");
            return;
        }

        DocumentFile profileDataRoot = findOrCreateDirectory(root, "profile_data");
        if (profileDataRoot == null) {
            call.reject("Could not access profile_data directory");
            return;
        }

        DocumentFile previousProfileDir = null;
        DocumentFile[] profileFolders = profileDataRoot.listFiles();
        for (DocumentFile candidate : profileFolders) {
            if (!candidate.isDirectory()) continue;
            DocumentFile candidateFile = candidate.findFile("profile_data.json");
            if (candidateFile != null && fileBelongsToProfile(candidateFile, profileId)) {
                previousProfileDir = candidate;
                break;
            }
        }

        String targetName = profileName;
        DocumentFile profileDir = findDirectoryIgnoringCase(profileDataRoot, targetName);
        if (profileDir != null) {
            DocumentFile existing = profileDir.findFile("profile_data.json");
            if (existing != null && !fileBelongsToProfile(existing, profileId)) {
                targetName = collisionSafeName(profileName, profileId, profileDataRoot);
                profileDir = findDirectoryIgnoringCase(profileDataRoot, targetName);
            } else if (existing != null) {
                targetName = profileDir.getName();
            } else if (existing == null && profileDir.listFiles().length > 0) {
                targetName = collisionSafeName(profileName, profileId, profileDataRoot);
                profileDir = findDirectoryIgnoringCase(profileDataRoot, targetName);
            }
        }
        boolean createdProfileDir = false;
        if (profileDir == null) {
            profileDir = profileDataRoot.createDirectory(targetName);
            createdProfileDir = profileDir != null;
        }
        if (profileDir == null || !profileDir.isDirectory()) {
            call.reject("Profile directory is not available");
            return;
        }

        DocumentFile destination = profileDir.findFile("profile_data.json");
        if (destination != null) {
            if (!destination.isFile() || !fileBelongsToProfile(destination, profileId)) {
                call.reject("Refusing to overwrite profile data that belongs to another profile");
                return;
            }
        } else if (!createdProfileDir && profileDir.listFiles().length > 0) {
            call.reject("Profile directory already contains unrecognized files");
            return;
        }

        DocumentFile temporary = profileDir.findFile("profile_data.json.tmp");
        if (temporary != null) {
            if (!temporary.isFile() || !fileBelongsToProfile(temporary, profileId)) {
                call.reject("Temporary profile file belongs to unknown data");
                return;
            }
            temporary.delete();
        }
        temporary = profileDir.createFile("application/json", "profile_data.json.tmp");
        if (temporary == null) {
            call.reject("Could not create temporary profile file");
            return;
        }

        try {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(temporary.getUri(), "wt")) {
                if (output == null) throw new IllegalStateException("Output stream unavailable");
                output.write(content.getBytes(StandardCharsets.UTF_8));
                output.flush();
            }
            if (!fileBelongsToProfile(temporary, profileId)) {
                temporary.delete();
                call.reject("Temporary profile file could not be verified");
                return;
            }

            DocumentFile backup = profileDir.findFile("profile_data.json.backup");
            if (backup != null && !fileBelongsToProfile(backup, profileId)) {
                call.reject("Existing backup belongs to unknown profile data");
                return;
            }
            if (destination != null) {
                if (backup != null) backup.delete();
                if (!destination.renameTo("profile_data.json.backup")) {
                    call.reject("Could not safely preserve the previous profile file");
                    return;
                }
                backup = profileDir.findFile("profile_data.json.backup");
                if (backup == null) {
                    call.reject("Could not verify the previous profile file");
                    return;
                }
            }

            if (!temporary.renameTo("profile_data.json")) {
                if (backup != null) backup.renameTo("profile_data.json");
                call.reject("The selected storage provider cannot safely replace profile files");
                return;
            }
            destination = profileDir.findFile("profile_data.json");
            if (destination == null || !fileBelongsToProfile(destination, profileId)) {
                if (destination != null) destination.delete();
                if (backup != null) backup.renameTo("profile_data.json");
                call.reject("New profile file failed verification; the previous copy was restored when possible");
                return;
            }
            if (backup != null) backup.delete();
            if (previousProfileDir != null && profileDir != null
                    && !previousProfileDir.getUri().equals(profileDir.getUri())) {
                DocumentFile[] oldEntries = previousProfileDir.listFiles();
                if (oldEntries.length == 1
                        && "profile_data.json".equals(oldEntries[0].getName())
                        && fileBelongsToProfile(oldEntries[0], profileId)) {
                    oldEntries[0].delete();
                    previousProfileDir.delete();
                }
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not write profile data", e);
        }
    }

    @PluginMethod
    public void saveProfileExport(PluginCall call) {
        String fileName = call.getString("fileName");
        String content = call.getString("content");
        if (!isSafeExportName(fileName) || content == null || content.getBytes(StandardCharsets.UTF_8).length > 25 * 1024 * 1024) {
            call.reject("Invalid profile export");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "saveProfileExportResult");
    }

    @ActivityCallback
    public void saveProfileExportResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Profile export cancelled");
            return;
        }
        String content = call.getString("content");
        Uri uri = result.getData().getData();
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IllegalStateException("Output stream unavailable");
            output.write(content.getBytes(StandardCharsets.UTF_8));
            output.flush();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save profile export", e);
        }
    }

    private String folderPreferenceKey(String profileId) {
        return isSafeProfileId(profileId) ? "music_folder_uri_" + profileId : PREF_FOLDER_URI;
    }

    private String writePermissionKey(String profileId) {
        return isSafeProfileId(profileId) ? "music_folder_write_" + profileId : "music_folder_write";
    }

    private boolean isSafeProfileId(String profileId) {
        return profileId != null && profileId.matches("[A-Za-z0-9_-]{1,128}");
    }

    private boolean isSafeDirectoryName(String name) {
        return name != null && name.length() > 0 && name.length() <= 64
                && !name.equals(".") && !name.equals("..")
                && !name.endsWith(".") && !name.endsWith(" ")
                && !name.matches("(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?")
                && name.matches("[^<>:\"/\\\\|?*\\p{Cntrl}]+");
    }

    private boolean isSafeExportName(String name) {
        return name != null && name.length() <= 120 && name.matches("[\\p{L}\\p{N} ._()'-]+\\.json");
    }

    private DocumentFile findOrCreateDirectory(DocumentFile parent, String name) {
        DocumentFile directory = parent.findFile(name);
        if (directory != null) return directory.isDirectory() ? directory : null;
        return parent.createDirectory(name);
    }

    private DocumentFile findDirectoryIgnoringCase(DocumentFile parent, String name) {
        for (DocumentFile child : parent.listFiles()) {
            if (child.isDirectory() && name.equalsIgnoreCase(child.getName())) return child;
        }
        return null;
    }

    private String collisionSafeName(String profileName, String profileId, DocumentFile parent) {
        String suffix = profileId.substring(0, Math.min(8, profileId.length()));
        String base = profileName.substring(0, Math.min(profileName.length(), 64 - suffix.length() - 1));
        String candidate = base + "-" + suffix;
        int index = 2;
        while (findDirectoryIgnoringCase(parent, candidate) != null) {
            String extra = "-" + index++;
            candidate = base.substring(0, Math.min(base.length(), 64 - suffix.length() - extra.length() - 1))
                    + "-" + suffix + extra;
        }
        return candidate;
    }

    private boolean fileBelongsToProfile(DocumentFile file, String profileId) {
        try (InputStream input = getContext().getContentResolver().openInputStream(file.getUri())) {
            if (input == null) return false;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[4096];
            int count;
            while ((count = input.read(data)) != -1) {
                buffer.write(data, 0, count);
                if (buffer.size() > 25 * 1024 * 1024) return false;
            }
            JSONObject json = new JSONObject(buffer.toString(StandardCharsets.UTF_8.name()));
            return json.optJSONObject("profile") != null
                    && profileId.equals(json.optJSONObject("profile").optString("id"));
        } catch (Exception e) {
            return false;
        }
    }
}
