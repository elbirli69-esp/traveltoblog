import { isMediaFile } from "@/lib/exif";

/** Opens the system file manager instead of the photo carousel (better GPS on Android). */
export function pickImagesFromFileExplorer(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "*/*";
    input.onchange = () => {
      const files = Array.from(input.files ?? []).filter(isMediaFile);
      resolve(files);
    };
    input.click();
  });
}

export async function pickImagesWithSystemPicker(): Promise<File[]> {
  const picker = (
    window as Window & {
      showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
    }
  ).showOpenFilePicker;

  if (!picker) {
    return pickImagesFromFileExplorer();
  }

  try {
    const handles = await picker({
      multiple: true,
      excludeAcceptAllOption: false,
    });
    const files = await Promise.all(handles.map((handle) => handle.getFile()));
    return files.filter(isMediaFile);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return [];
    }
    return pickImagesFromFileExplorer();
  }
}
