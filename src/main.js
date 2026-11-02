import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

import { auth, googleProvider } from "./firebase.js";



// ============================================================

// NUESTROS RECUERDOS — interfaz con persistencia en Google Drive

// Archivo: src/main.js

// La autenticación usa Firebase; los datos y archivos se guardan en el Drive

// propietario a través de un puente HtmlService de Apps Script.

// ============================================================



const $ = (selector, root = document) => root.querySelector(selector);



const elements = {

  loginSection: $("#login-section"),

  privateApp: $("#private-app"),

  signInButton: $("#google-sign-in-button"),

  signOutButton: $("#sign-out-button"),

  currentUser: $("#current-user"),

  loginMessage: $("#login-message"),



  memoryForm: $("#memory-form"),

  uploadSection: $("#subir"),
  uploadSectionToggle: $("#upload-section-toggle"),
  uploadSectionToggleLabel: $("#upload-section-toggle-label"),
  uploadSectionToggleIcon: $("#upload-section-toggle-icon"),
  uploadSectionContent: $("#upload-section-content"),

  memoryId: $("#memory-id"),

  memoryFolder: $("#memory-folder"),

  folderForm: $("#folder-form"),
  cancelFolderButton: $("#cancel-folder-button"),

  folderTitle: $("#folder-title"),

  folderFormMessage: $("#folder-form-message"),

  foldersGrid: $("#folders-grid"),

  foldersCount: $("#folders-count"),

  filtersToggle: $("#filters-toggle"),
  filtersToggleIcon: $("#filters-toggle-icon"),
  filtersContent: $("#filters-content"),
  activeFolderHeading: $("#active-folder-heading"),
  activeFolderTitle: $("#active-folder-title"),

  showAllMemoriesButton: $("#show-all-memories-button"),

  photoInput: $("#photo-input"),

  videoInput: $("#video-input"),

  audioInput: $("#audio-input"),

  selectedFiles: $("#selected-files"),
  mediaSelectionFieldset: $("#media-selection-fieldset"),
  existingFileNameEditor: $("#existing-file-name-editor"),
  existingFileName: $("#existing-file-name"),
  existingFileExtension: $("#existing-file-extension"),
  createSomethingFieldset: $("#create-something-fieldset"),
  existingFileDescriptionControl: $("#existing-file-description-control"),
  existingFileDescription: $("#existing-file-description"),
  memoryDescriptionLabel: $("#memory-description-label"),

  description: $("#memory-description"),

  memoryDate: $("#memory-date"),

  formMessage: $("#memory-form-message"),

  saveButton: $("#save-memory-button"),

  cancelEditButton: $("#cancel-edit-button"),



  cameraPreview: $("#camera-preview"),

  cameraPlaceholder: $("#camera-placeholder"),

  photoCanvas: $("#photo-canvas"),

  startCameraButton: $("#start-camera-button"),

  takePhotoButton: $("#take-photo-button"),

  startVideoButton: $("#start-video-button"),

  stopVideoButton: $("#stop-video-button"),

  stopCameraButton: $("#stop-camera-button"),



  audioStatusIndicator: $("#audio-status-indicator"),

  audioStatusText: $("#audio-status-text"),

  startAudioButton: $("#start-audio-button"),

  stopAudioButton: $("#stop-audio-button"),

  audioPreview: $("#audio-preview"),



  uploadProgressArea: $("#upload-progress-area"),

  uploadStatus: $("#upload-status"),
  uploadProgressPercent: $("#upload-progress-percent"),
  uploadProgressFill: $("#upload-progress-fill"),
  uploadProgress: $("#upload-progress"),



  search: $("#memory-search"),

  filterScope: $("#filter-scope"),

  filterType: $("#filter-type"),

  sort: $("#sort-memories"),

  clearFiltersButton: $("#clear-filters-button"),

  memoriesCount: $("#memories-count"),

  memoriesLoading: $("#memories-loading"),

  memoriesEmpty: $("#memories-empty"),

  memoriesError: $("#memories-error"),

  memoriesErrorText: $("#memories-error-text"),

  retryMemoriesButton: $("#retry-memories-button"),

  memoriesGrid: $("#memories-grid"),



  deleteDialog: $("#delete-confirmation-dialog"),

  cancelDeleteButton: $("#cancel-delete-button"),

  confirmDeleteButton: $("#confirm-delete-button"),



  photoViewerDialog: $("#photo-viewer-dialog"),

  photoViewerImage: $("#photo-viewer-image"),

  photoViewerCaption: $("#photo-viewer-caption"),

  photoViewerStage: $("#photo-viewer-stage"),

  photoZoomOut: $("#photo-zoom-out"),

  photoZoomIn: $("#photo-zoom-in"),

  photoZoomReset: $("#photo-zoom-reset"),

  photoZoomLevel: $("#photo-zoom-level"),

  photoViewerClose: $("#photo-viewer-close"),

  videoViewerDialog: $("#video-viewer-dialog"),
  videoViewerTitle: $("#video-viewer-title"),
  videoViewerPlayer: $("#video-viewer-player"),
  videoViewerClose: $("#video-viewer-close"),
  videoViewerStatus: $("#video-viewer-status"),

};



const state = {

  selectedFiles: [],

  editingMemory: null,

  memories: [],

  folders: [],

  activeFolderId: "all",

  folderFormOpen: false,

  cameraStream: null,

  audioStream: null,

  videoRecorder: null,

  audioRecorder: null,

  videoChunks: [],

  audioChunks: [],

  pendingDeleteId: null,

  isEditing: false,

  nextId: 1,

  objectUrls: new Set(),

  autoSuggestedMemoryDate: "",

  memoryDateManuallyEdited: false,

  exifSuggestionRequest: 0,

  backendReady: false,

  backendUserUid: null,

  backendLoadPromise: null,

};



// Puente seguro entre la aplicación Vite y Apps Script. Apps Script se abre

// en un iframe propio porque el navegador no permite leer directamente las

// respuestas de ContentService desde localhost por CORS.

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw2fk8dvKthMnejYIt3EfZIr1s98s0U70NYFF2A3Gc2mFuAUoGUqjxwWpwAkLbPqaK2/exec";

const BRIDGE_CHANNEL = "NUESTROS_RECUERDOS_DRIVE_BRIDGE_V1";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

let driveBridgeFrame = null;

let driveBridgeChildWindow = null;

let driveBridgeReadyResolve = null;

let driveBridgeReadyReject = null;

let driveBridgeReadyTimer = null;

let driveBridgeReadyPromise = null;

let driveBridgeRequestNumber = 0;

const driveBridgePending = new Map();



function getDriveBridge() {

  if (driveBridgeFrame) return driveBridgeReadyPromise;



  driveBridgeReadyPromise = new Promise((resolve, reject) => {

    driveBridgeReadyResolve = resolve;

    driveBridgeReadyReject = reject;

  });

  driveBridgeReadyTimer = setTimeout(() => {

    driveBridgeReadyReject?.(new Error("Apps Script no respondió. Verificá que hayas agregado Bridge.html y actualizado el despliegue."));

    driveBridgeReadyReject = null;

  }, 30000);



  window.addEventListener("message", (event) => {

    if (!driveBridgeFrame) return;

    const message = event.data;

    if (!message || message.channel !== BRIDGE_CHANNEL) return;



    // Apps Script agrega iframes internos de sandbox. El código HTML del

    // puente no emite los mensajes desde driveBridgeFrame.contentWindow,

    // sino desde un iframe descendiente alojado en googleusercontent.com.

    const origin = event.origin || "";

      const trustedOrigin = origin === "https://script.google.com" || /^https:\/\/(?:[a-z0-9-]+\.)*googleusercontent\.com$/i.test(origin);


    if (!trustedOrigin) return;



    if (message.type === "ready") {

      // Verificamos que la ventana emisora sea descendiente del iframe

      // de Apps Script y la guardamos para enviarle las solicitudes.

      let sourceWindow = event.source;

      let belongsToBridge = false;

      while (sourceWindow) {

        if (sourceWindow === driveBridgeFrame.contentWindow) {

          belongsToBridge = true;

          break;

        }

        try {

          const parentWindow = sourceWindow.parent;

          if (!parentWindow || parentWindow === sourceWindow) break;

          sourceWindow = parentWindow;

        } catch (_) {

          break;

        }

      }

      if (!belongsToBridge || !event.source) return;

      driveBridgeChildWindow = event.source;

      if (driveBridgeReadyTimer) clearTimeout(driveBridgeReadyTimer);

      driveBridgeReadyTimer = null;

      driveBridgeReadyResolve?.();

      driveBridgeReadyResolve = null;

      driveBridgeReadyReject = null;

      return;

    }



    if (event.source !== driveBridgeChildWindow) return;

    if (message.type !== "result" || !message.requestId) return;

    const pending = driveBridgePending.get(message.requestId);

    if (!pending) return;

    clearTimeout(pending.timeout);

    driveBridgePending.delete(message.requestId);

    if (message.ok) pending.resolve(message.data);

    else pending.reject(new Error(message.error || "Apps Script no pudo completar la operación."));

  });



  driveBridgeFrame = document.createElement("iframe");

  driveBridgeFrame.title = "Conexión privada con Google Drive";

  driveBridgeFrame.setAttribute("aria-hidden", "true");

  driveBridgeFrame.tabIndex = -1;

  driveBridgeFrame.style.cssText = "position:fixed;width:1px;height:1px;left:-10px;bottom:0;border:0;opacity:0;pointer-events:none";

  driveBridgeFrame.src = `${APPS_SCRIPT_URL}?bridge=1`;

  document.body.append(driveBridgeFrame);

  return driveBridgeReadyPromise;

}



async function callDriveBridge(action, payload = {}) {

  const user = auth.currentUser;

  if (!user) throw new Error("La sesión de Google expiró. Iniciá sesión nuevamente.");

  try {

    await getDriveBridge();

  } catch (error) {

    driveBridgeFrame?.remove();

    driveBridgeFrame = null;

    driveBridgeChildWindow = null;

    driveBridgeReadyPromise = null;

    driveBridgeReadyResolve = null;

    driveBridgeReadyReject = null;

    if (driveBridgeReadyTimer) clearTimeout(driveBridgeReadyTimer);

    driveBridgeReadyTimer = null;

    throw error;

  }

  const token = await user.getIdToken();

  const requestId = `nr-${Date.now()}-${++driveBridgeRequestNumber}`;



  return new Promise((resolve, reject) => {

    // Las transferencias de archivos grandes pueden tardar más que las operaciones comunes.
    const requestTimeout = action === "save-memory" || action === "get-media"
      ? 420000
      : 180000;
    const timeout = setTimeout(() => {

      driveBridgePending.delete(requestId);

      reject(new Error("La conexión con Google Drive tardó demasiado. Volvé a intentar."));

    }, requestTimeout);

    driveBridgePending.set(requestId, { resolve, reject, timeout });

    if (!driveBridgeChildWindow) {

      clearTimeout(timeout);

      driveBridgePending.delete(requestId);

      reject(new Error("El puente de Apps Script no quedó listo para recibir solicitudes."));

      return;

    }

    driveBridgeChildWindow.postMessage({

      channel: BRIDGE_CHANNEL,

      type: "request",

      requestId,

      action,

      token,

      payload,

    }, "*");

  });

}



let uploadSectionTransitionId = 0;
let uploadSectionTransitionTimer = null;

function setUploadSectionExpanded(expanded) {
  if (!elements.uploadSectionToggle || !elements.uploadSectionContent || !elements.uploadSection) return;

  const isExpanded = Boolean(expanded);
  const currentlyExpanded = elements.uploadSectionToggle.getAttribute("aria-expanded") === "true";
  const content = elements.uploadSectionContent;
  const toggle = elements.uploadSectionToggle;
  const transitionId = ++uploadSectionTransitionId;
  const transitionDuration = 900;

  if (uploadSectionTransitionTimer !== null) {
    window.clearTimeout(uploadSectionTransitionTimer);
    uploadSectionTransitionTimer = null;
  }

  if (isExpanded !== currentlyExpanded) {
    if (isExpanded) {
      // Reveal the content at height zero, then animate it to its measured height.
      content.hidden = false;
      content.inert = false;
      content.style.overflow = "hidden";
      content.style.maxHeight = "0px";
      content.style.opacity = "0";
      content.style.transform = "translateY(-6px)";
      void content.offsetHeight;

      window.requestAnimationFrame(() => {
        if (transitionId !== uploadSectionTransitionId) return;

        content.classList.add("is-expanded");
        content.style.maxHeight = `${content.scrollHeight}px`;
        content.style.opacity = "1";
        content.style.transform = "translateY(0)";

        uploadSectionTransitionTimer = window.setTimeout(() => {
          if (transitionId !== uploadSectionTransitionId ||
              toggle.getAttribute("aria-expanded") !== "true") return;

          // Remove the height cap after the animation so the form can resize normally.
          content.style.maxHeight = "none";
          content.style.overflow = "";
          uploadSectionTransitionTimer = null;
        }, transitionDuration + 40);
      });
    } else {
      // Freeze the current height before collapsing it, and prevent tabbing into it.
      content.hidden = false;
      content.inert = true;
      content.style.overflow = "hidden";
      content.style.maxHeight = `${content.scrollHeight}px`;
      content.style.opacity = "1";
      content.style.transform = "translateY(0)";
      void content.offsetHeight;

      window.requestAnimationFrame(() => {
        if (transitionId !== uploadSectionTransitionId) return;

        content.classList.remove("is-expanded");
        content.style.maxHeight = "0px";
        content.style.opacity = "0";
        content.style.transform = "translateY(-6px)";

        uploadSectionTransitionTimer = window.setTimeout(() => {
          if (transitionId !== uploadSectionTransitionId ||
              toggle.getAttribute("aria-expanded") === "true") return;

          content.hidden = true;
          content.style.maxHeight = "";
          content.style.opacity = "";
          content.style.transform = "";
          content.style.overflow = "";
          uploadSectionTransitionTimer = null;
        }, transitionDuration + 40);
      });
    }
  }

  toggle.setAttribute("aria-expanded", String(isExpanded));
  toggle.title = isExpanded
    ? "Ocultar el formulario para subir un recuerdo"
    : "Mostrar el formulario para subir un recuerdo";

  if (elements.uploadSectionToggleLabel) {
    elements.uploadSectionToggleLabel.textContent = isExpanded
      ? "Ocultar formulario de carga"
      : "Subir un recuerdo";
  }

  if (elements.uploadSectionToggleIcon) {
    elements.uploadSectionToggleIcon.textContent = isExpanded ? "−" : "+";
  }

  elements.uploadSection.classList.toggle("is-collapsed", !isExpanded);
} 

elements.uploadSectionToggle?.addEventListener("click", () => {
  const isExpanded = elements.uploadSectionToggle.getAttribute("aria-expanded") === "true";
  const isRecording = state.videoRecorder?.state === "recording" || state.audioRecorder?.state === "recording";
  // No permitir ocultar los controles mientras se edita, guarda o graba.
  if (isExpanded && (state.isEditing || elements.saveButton?.disabled || isRecording)) return;
  setUploadSectionExpanded(!isExpanded);
});

function updateUploadProgress(percent, status) {
  const value = Math.round(Math.max(0, Math.min(100, Number(percent) || 0)));
  if (elements.uploadProgress) elements.uploadProgress.setAttribute("aria-valuenow", String(value));
  if (elements.uploadProgressFill) elements.uploadProgressFill.style.width = `${value}%`;
  if (elements.uploadProgressPercent) elements.uploadProgressPercent.textContent = `${value}%`;
  if (status !== undefined && elements.uploadStatus) elements.uploadStatus.textContent = status;
}

/*
 * Apps Script no publica eventos de progreso de la transferencia del archivo.
 * Durante FileReader se muestra el progreso real de preparación; mientras
 * Google procesa la solicitud, el porcentaje avanza como estimación y se
 * confirma al recibir respuesta del servidor. No se presenta como porcentaje
 * exacto de bytes transmitidos.
 */
function startEstimatedUploadProgress(start, end) {
  let value = start;
  updateUploadProgress(value);
  const timer = window.setInterval(() => {
    if (value >= end) return;
    value = Math.min(end, value + 1);
    updateUploadProgress(value);
  }, 450);
  return () => window.clearInterval(timer);
}

function fileToBase64(file, onProgress = null) {

  if (file.size > MAX_FILE_BYTES) {

    throw new Error(`El archivo «${file.name}» supera el límite de 50 MB por archivo. Reducí su tamaño e intentá nuevamente.`);

  }

  return new Promise((resolve, reject) => {

    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (typeof onProgress === "function" && event.lengthComputable && event.total > 0) {
        onProgress(Math.max(0, Math.min(1, event.loaded / event.total)));
      }
    };

    reader.onerror = () => reject(new Error(`No se pudo leer el archivo «${file.name}».`));

    reader.onload = () => {

      const result = String(reader.result || "");

      const comma = result.indexOf(",");

      if (comma < 0) return reject(new Error(`No se pudo preparar el archivo «${file.name}».`));

      if (typeof onProgress === "function") onProgress(1);
      resolve(result.slice(comma + 1));

    };

    reader.readAsDataURL(file);

  });

}



async function refreshDataFromDrive() {

  state.backendReady = false;

  elements.memoriesLoading.hidden = false;

  elements.memoriesEmpty.hidden = true;

  elements.memoriesError.hidden = true;

  elements.memoriesCount.textContent = "Conectando con Google Drive...";

  try {

    const data = await callDriveBridge("load");

    state.folders = Array.isArray(data.folders) ? data.folders : [];

    state.memories = (Array.isArray(data.memories) ? data.memories : []).map((memory) => ({

      ...memory,

      file: null,

      fileUrl: "",

    }));

    state.backendReady = true;

    state.backendUserUid = auth.currentUser?.uid || null;

    refreshFolderOptions();

    elements.memoriesLoading.hidden = true;

    elements.memoriesError.hidden = true;

    renderFolders();

    renderMemories();

    setMessage(elements.loginMessage, `Conectado con Google Drive. ${state.memories.length} recuerdo(s) cargado(s).`, "success");

  } catch (error) {

    console.error("No se pudo cargar la información desde Google Drive:", error);

    state.backendReady = false;

    elements.memoriesLoading.hidden = true;

    elements.memoriesEmpty.hidden = true;

    elements.memoriesError.hidden = false;

    elements.memoriesErrorText.textContent = `No se pudieron cargar los recuerdos desde Drive. ${error.message || error}`;

    elements.memoriesCount.textContent = "No se pudo conectar con Google Drive";

    setMessage(elements.loginMessage, "Iniciaste sesión, pero la conexión con Google Drive falló. Revisá el mensaje en «Ver recuerdos».", "error");

    throw error;

  }

}



// No se debe confiar solo en el control visual de acceso: Apps Script valida

// nuevamente el token Firebase y el correo autorizado en cada operación.



// ---------- Utilidades generales ----------



function createId() {

  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  return `memory-${Date.now()}-${state.nextId++}`;

}



function setMessage(element, message, kind = "") {

  if (!element) return;

  element.textContent = message;

  element.dataset.kind = kind;

}



function formatDateTime(value) {

  if (!value) return "Sin fecha";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-AR", {

    dateStyle: "medium",

    timeStyle: "short",

  }).format(date);

}



function formatMemoryDate(value) {

  if (!value) return "No especificada";

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) return "No especificada";

  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(date);

}



function registerObjectUrl(fileOrBlob) {

  const url = URL.createObjectURL(fileOrBlob);

  state.objectUrls.add(url);

  return url;

}



function revokeObjectUrl(url) {

  if (url && state.objectUrls.has(url)) {

    URL.revokeObjectURL(url);

    state.objectUrls.delete(url);

  }

}



function getMediaType(file) {

  if (file.type.startsWith("image/")) return "image";

  if (file.type.startsWith("video/")) return "video";

  if (file.type.startsWith("audio/")) return "audio";

  return "file";

}



function splitFileName(fileName) {
  const value = String(fileName || "");
  const dot = value.lastIndexOf(".");
  if (dot > 0 && dot < value.length - 1) {
    return { base: value.slice(0, dot), extension: value.slice(dot) };
  }
  return { base: value, extension: "" };
}

function composeFileName(baseName, extension = "") {
  let base = String(baseName || "")
    .replace(/[\\/\r\n]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .trim();
  const ext = String(extension || "");
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) {
    base = base.slice(0, -ext.length).trim();
  }
  if (!base) return "";
  const maxBaseLength = Math.max(1, 180 - ext.length);
  return `${base.slice(0, maxBaseLength)}${ext}`;
}

function selectedFileName(entry) {
  return typeof entry.fileName === "string" ? entry.fileName : entry.file.name;
}

function releaseSelectedFilePreview(entry) {
  if (entry?.previewUrl) {
    URL.revokeObjectURL(entry.previewUrl);
    entry.previewUrl = "";
  }
}

function releaseAllSelectedFilePreviews() {
  state.selectedFiles.forEach(releaseSelectedFilePreview);
}

function getSelectedPreviewKind(file) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(name)) return "image";
  if (type.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp|avi|mkv)$/i.test(name)) return "video";
  if (type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(name)) return "audio";
  return "file";
}

function updateExistingFileNameEditor() {
  const memory = state.editingMemory;
  const showEditor = Boolean(
    state.isEditing &&
    memory?.driveFileId &&
    state.selectedFiles.length === 0 &&
    elements.existingFileNameEditor &&
    elements.existingFileName &&
    elements.existingFileExtension
  );

  if (elements.existingFileNameEditor) {
    elements.existingFileNameEditor.hidden = !showEditor;
  }

  if (showEditor) {
    const parts = splitFileName(memory.fileName || "");
    elements.existingFileExtension.textContent = parts.extension;
  }
}

function updateSelectedFiles() {
  elements.selectedFiles.replaceChildren();

  if (state.selectedFiles.length === 0) {
    const message = document.createElement("p");
    message.className = "muted-text";
    message.textContent = "Todavía no seleccionaste ningún archivo.";
    elements.selectedFiles.append(message);
    updateExistingFileNameEditor();
    return;
  }

  state.selectedFiles.forEach((entry) => {
    const row = document.createElement("article");
    row.className = "selected-file-item";

    const previewKind = getSelectedPreviewKind(entry.file);
    const preview = document.createElement("div");
    preview.className = `selected-file-preview selected-file-preview-${previewKind}`;
    preview.setAttribute("aria-hidden", "true");

    if (entry.previewUrl && previewKind === "image") {
      const image = document.createElement("img");
      image.className = "selected-file-thumbnail";
      image.src = entry.previewUrl;
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("error", () => {
        preview.replaceChildren(makeElement("span", "selected-file-preview-icon", "▧"));
      }, { once: true });
      preview.append(image);
    } else if (entry.previewUrl && previewKind === "video") {
      const video = document.createElement("video");
      video.className = "selected-file-thumbnail selected-file-thumbnail-video";
      video.src = entry.previewUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      preview.append(video, makeElement("span", "selected-file-preview-badge", "VIDEO"));
    } else {
      const icon = previewKind === "audio" ? "♫" : previewKind === "video" ? "▷" : "▧";
      preview.append(makeElement("span", "selected-file-preview-icon", icon));
    }

    const content = document.createElement("div");
    content.className = "selected-file-content";
    const mediaLabel = previewKind === "image" ? "Foto" : previewKind === "video" ? "Video" : previewKind === "audio" ? "Audio" : "Archivo";
    content.append(makeElement("p", "selected-file-meta", `${formatBytes(entry.file.size)} · ${mediaLabel}`));

    const nameParts = splitFileName(selectedFileName(entry));
    const nameLabel = document.createElement("label");
    nameLabel.className = "selected-file-name-label";
    nameLabel.textContent = "Nombre del archivo";
    const nameGroup = document.createElement("div");
    nameGroup.className = "filename-input-group";
    const nameInput = document.createElement("input");
    nameInput.className = "selected-file-name-input";
    nameInput.type = "text";
    nameInput.maxLength = 180;
    nameInput.autocomplete = "off";
    nameInput.value = nameParts.base;
    nameInput.setAttribute("aria-label", `Nombre del archivo ${entry.file.name}`);
    nameInput.addEventListener("input", () => {
      entry.fileName = composeFileName(nameInput.value, nameParts.extension);
    });
    const extension = makeElement("span", "filename-extension", nameParts.extension);
    extension.setAttribute("aria-hidden", "true");
    nameGroup.append(nameInput, extension);
    nameLabel.append(nameGroup);

    const descriptionLabel = document.createElement("label");
    descriptionLabel.className = "selected-file-description-label";
    descriptionLabel.textContent = "Descripción de este archivo (opcional)";
    const descriptionInput = document.createElement("textarea");
    descriptionInput.className = "selected-file-description";
    descriptionInput.rows = 2;
    descriptionInput.maxLength = 2000;
    descriptionInput.placeholder = "Describí este archivo...";
    descriptionInput.value = entry.description || "";
    descriptionInput.addEventListener("input", () => { entry.description = descriptionInput.value; });
    descriptionLabel.append(descriptionInput);

    const removeButton = document.createElement("button");
    removeButton.className = "button button-quiet selected-file-remove";
    removeButton.type = "button";
    removeButton.textContent = "Quitar";
    removeButton.setAttribute("aria-label", `Quitar ${selectedFileName(entry)}`);
    removeButton.addEventListener("click", () => {
      releaseSelectedFilePreview(entry);
      state.selectedFiles = state.selectedFiles.filter((item) => item.id !== entry.id);
      updateSelectedFiles();
      void updateMemoryDateSuggestion();
    });

    content.append(nameLabel, descriptionLabel, removeButton);
    row.append(preview, content);
    elements.selectedFiles.append(row);
  });

  updateExistingFileNameEditor();
}

function formatBytes(bytes) {

  if (!Number.isFinite(bytes) || bytes < 0) return "";

  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;

}



// ---------- Fecha automática desde metadatos EXIF de fotos JPEG ----------

function isJpegImage(file) {
  if (!file) return false;
  const mimeType = String(file.type || "").toLowerCase();
  const fileName = String(file.name || "").toLowerCase();
  return mimeType === "image/jpeg" || mimeType === "image/pjpeg" || /\.(jpe?g)$/.test(fileName);
}

function formatExifDateForInput(value) {
  const match = /^(\d{4}):(\d{2}):(\d{2})(?:\s|$)/.exec(String(value || "").trim());
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return "";

  const checkedDate = new Date(0);
  checkedDate.setUTCFullYear(year, month - 1, day);
  checkedDate.setUTCHours(0, 0, 0, 0);
  if (
    checkedDate.getUTCFullYear() !== year ||
    checkedDate.getUTCMonth() !== month - 1 ||
    checkedDate.getUTCDate() !== day
  ) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseExifDateFromJpegBuffer(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return "";

  function parseExifSegment(segmentStart, segmentLength) {
    const payloadStart = segmentStart + 2;
    const payloadEnd = segmentStart + segmentLength;
    if (payloadStart + 14 > payloadEnd) return "";

    // El segmento APP1 de EXIF comienza con los seis bytes "Exif\0\0".
    if (
      bytes[payloadStart] !== 0x45 ||
      bytes[payloadStart + 1] !== 0x78 ||
      bytes[payloadStart + 2] !== 0x69 ||
      bytes[payloadStart + 3] !== 0x66 ||
      bytes[payloadStart + 4] !== 0x00 ||
      bytes[payloadStart + 5] !== 0x00
    ) {
      return "";
    }

    const tiffStart = payloadStart + 6;
    const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
    const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
    if (!littleEndian && !bigEndian) return "";
    if (tiffStart + 8 > payloadEnd) return "";

    const getUint16 = (offset) => {
      if (offset < tiffStart || offset + 2 > payloadEnd) throw new Error("EXIF fuera de rango");
      return view.getUint16(offset, littleEndian);
    };
    const getUint32 = (offset) => {
      if (offset < tiffStart || offset + 4 > payloadEnd) throw new Error("EXIF fuera de rango");
      return view.getUint32(offset, littleEndian);
    };

    try {
      if (getUint16(tiffStart + 2) !== 42) return "";
      const firstIfdOffset = getUint32(tiffStart + 4);

      function readIfdEntries(ifdOffset) {
        const ifdStart = tiffStart + ifdOffset;
        const entryCount = getUint16(ifdStart);
        if (entryCount > 512) return [];
        const entries = [];

        for (let index = 0; index < entryCount; index += 1) {
          const entryOffset = ifdStart + 2 + index * 12;
          if (entryOffset + 12 > payloadEnd) return [];
          entries.push({
            tag: getUint16(entryOffset),
            type: getUint16(entryOffset + 2),
            count: getUint32(entryOffset + 4),
            valueOffset: entryOffset + 8,
          });
        }
        return entries;
      }

      function readAscii(entry) {
        if (!entry || entry.type !== 2 || entry.count < 1 || entry.count > 256) return "";
        const byteLength = entry.count;
        const dataOffset = byteLength <= 4
          ? entry.valueOffset
          : tiffStart + getUint32(entry.valueOffset);
        if (dataOffset < tiffStart || dataOffset + byteLength > payloadEnd) return "";

        let value = "";
        for (let index = 0; index < byteLength; index += 1) {
          const code = bytes[dataOffset + index];
          if (code === 0) break;
          value += String.fromCharCode(code);
        }
        return value.trim();
      }

      const ifd0Entries = readIfdEntries(firstIfdOffset);
      const exifIfdEntry = ifd0Entries.find((entry) => entry.tag === 0x8769);
      let originalDate = "";
      let digitizedDate = "";

      if (exifIfdEntry && exifIfdEntry.type === 4 && exifIfdEntry.count === 1) {
        const exifIfdOffset = getUint32(exifIfdEntry.valueOffset);
        const exifEntries = readIfdEntries(exifIfdOffset);
        originalDate = readAscii(exifEntries.find((entry) => entry.tag === 0x9003));
        digitizedDate = readAscii(exifEntries.find((entry) => entry.tag === 0x9004));
      }

      const generalDate = readAscii(ifd0Entries.find((entry) => entry.tag === 0x0132));
      return [originalDate, digitizedDate, generalDate]
        .map(formatExifDateForInput)
        .find(Boolean) || "";
    } catch (_) {
      return "";
    }
  }

  let offset = 2;
  while (offset + 1 < view.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < view.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= view.byteLength) break;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > view.byteLength) break;

    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;

    if (marker === 0xe1) {
      const date = parseExifSegment(offset, segmentLength);
      if (date) return date;
    }

    offset += segmentLength;
  }

  return "";
}

async function readJpegExifDate(file) {
  try {
    // Los metadatos JPEG se encuentran al comienzo del archivo; no hace falta leer la foto completa.
    const header = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    return parseExifDateFromJpegBuffer(header);
  } catch (_) {
    // La ausencia o lectura fallida de metadatos no debe interrumpir la carga.
    return "";
  }
}

async function updateMemoryDateSuggestion() {
  if (state.memoryDateManuallyEdited || state.isEditing || !elements.memoryDate) return;

  const currentValue = elements.memoryDate.value;
  if (currentValue && currentValue !== state.autoSuggestedMemoryDate) {
    state.memoryDateManuallyEdited = true;
    state.autoSuggestedMemoryDate = "";
    return;
  }

  const requestId = ++state.exifSuggestionRequest;
  const jpegEntries = state.selectedFiles.filter((entry) => isJpegImage(entry.file));
  let suggestedDate = "";

  if (jpegEntries.length > 0) {
    const dates = await Promise.all(
      jpegEntries.map((entry) => entry.exifDatePromise || readJpegExifDate(entry.file)),
    );

    if (requestId !== state.exifSuggestionRequest) return;
    const allHaveDate = dates.every(Boolean);
    const sameDate = allHaveDate && dates.every((date) => date === dates[0]);
    if (sameDate) suggestedDate = dates[0];
  }

  if (requestId !== state.exifSuggestionRequest || state.memoryDateManuallyEdited || state.isEditing) return;

  const latestValue = elements.memoryDate.value;
  if (latestValue && latestValue !== state.autoSuggestedMemoryDate) {
    state.memoryDateManuallyEdited = true;
    state.autoSuggestedMemoryDate = "";
    return;
  }

  if (suggestedDate) {
    elements.memoryDate.value = suggestedDate;
    state.autoSuggestedMemoryDate = suggestedDate;
  } else {
    if (state.autoSuggestedMemoryDate && latestValue === state.autoSuggestedMemoryDate) {
      elements.memoryDate.value = "";
    }
    state.autoSuggestedMemoryDate = "";
  }
}


function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;

  for (const file of files) {
    const duplicate = state.selectedFiles.some(
      (entry) =>
        entry.file.name === file.name &&
        entry.file.size === file.size &&
        entry.file.lastModified === file.lastModified,
    );

    if (!duplicate) {
      const previewKind = getSelectedPreviewKind(file);
      const previewUrl = previewKind === "image" || previewKind === "video"
        ? URL.createObjectURL(file)
        : "";
      state.selectedFiles.push({
        id: createId(),
        file,
        fileName: file.name,
        description: "",
        previewUrl,
        exifDatePromise: isJpegImage(file) ? readJpegExifDate(file) : Promise.resolve(""),
      });
    }
  }

  updateSelectedFiles();
  void updateMemoryDateSuggestion();
  setMessage(elements.formMessage, "");
}

function clearFileInputs() {

  elements.photoInput.value = "";

  elements.videoInput.value = "";

  elements.audioInput.value = "";

}



function stopStream(stream) {

  stream?.getTracks().forEach((track) => track.stop());

}



function setButtonDisabled(button, disabled) {

  if (button) button.disabled = disabled;

}



// ---------- Autenticación con Firebase ----------

const AUTHORIZED_EMAILS = [

  "mauricio.ariel.buda@gmail.com",

  "wakeuprodiaz@gmail.com",

].map((email) => email.trim().toLocaleLowerCase("es-AR"));



let isSigningIn = false;



async function showAuthenticatedApp(user) {

  elements.loginSection.hidden = true;

  elements.privateApp.hidden = false;

  elements.currentUser.hidden = false;

  elements.currentUser.textContent = user.displayName || user.email || "Sesión iniciada";

  elements.signOutButton.hidden = false;



  if (state.backendReady && state.backendUserUid === user.uid) {

    renderFolders();

    renderMemories();

    return;

  }

  if (state.backendLoadPromise) {

    try { await state.backendLoadPromise; } catch (_) { /* el primer intento ya mostró el error */ }

    return;

  }

  state.backendLoadPromise = refreshDataFromDrive();

  try {

    await state.backendLoadPromise;

  } catch (_) {

    // El detalle ya se muestra en la sección de recuerdos y en la consola.

  } finally {

    state.backendLoadPromise = null;

  }

}



function showLogin() {

  setMemoryEditingMode(false);

  stopCamera();

  stopAudioRecording();

  elements.privateApp.hidden = true;

  elements.loginSection.hidden = false;

  elements.currentUser.hidden = true;

  elements.signOutButton.hidden = true;

  state.backendReady = false;

  state.backendUserUid = null;

}



if (elements.signInButton) {

  elements.signInButton.textContent = "Iniciar sesión con Google";

}



elements.signInButton?.addEventListener("click", async () => {

  if (isSigningIn) return;

  isSigningIn = true;

  elements.signInButton.disabled = true;

  setMessage(elements.loginMessage, "Abriendo el inicio de sesión de Google...");



  try {

    const result = await signInWithPopup(auth, googleProvider);

    const email = result.user.email?.trim().toLocaleLowerCase("es-AR");

    if (!email || !AUTHORIZED_EMAILS.includes(email)) {

      await signOut(auth);

      showLogin();

      setMessage(elements.loginMessage, "Esta cuenta de Google no está autorizada. Usá una de las dos cuentas habilitadas.", "error");

      return;

    }

    await showAuthenticatedApp(result.user);

  } catch (error) {

    console.error("Error al iniciar sesión o conectar con Google Drive:", error);

    if (auth.currentUser && AUTHORIZED_EMAILS.includes((auth.currentUser.email || "").trim().toLowerCase())) {

      // No cerramos una sesión válida si el problema está solamente en el backend.

      setMessage(elements.loginMessage, "La sesión inició, pero no se pudo conectar con Drive. Consultá el mensaje en «Ver recuerdos».", "error");

    } else {

      let message = "No se pudo iniciar sesión. Volvé a intentarlo.";

      if (error?.code === "auth/popup-closed-by-user") message = "Se cerró la ventana de inicio de sesión antes de completar el acceso.";

      else if (error?.code === "auth/unauthorized-domain") message = "Este dominio no está autorizado en Firebase Authentication. Revisá los dominios autorizados del proyecto.";

      else if (error?.code === "auth/popup-blocked") message = "El navegador bloqueó la ventana emergente. Permití las ventanas emergentes para este sitio y volvé a intentarlo.";

      setMessage(elements.loginMessage, message, "error");

    }

  } finally {

    isSigningIn = false;

    if (elements.signInButton) elements.signInButton.disabled = false;

  }

});



elements.signOutButton?.addEventListener("click", async () => {

  try {

    await signOut(auth);

    showLogin();

    setMessage(elements.loginMessage, "Cerraste la sesión correctamente.");

  } catch (error) {

    console.error("Error al cerrar sesión:", error);

    setMessage(elements.loginMessage, "No se pudo cerrar la sesión. Volvé a intentarlo.", "error");

  }

});



onAuthStateChanged(auth, async (user) => {

  if (!user) {

    showLogin();

    return;

  }

  const email = user.email?.trim().toLowerCase();

  if (!email || !AUTHORIZED_EMAILS.includes(email)) {

    try { await signOut(auth); } catch (error) { console.error("No se pudo cerrar la sesión de una cuenta no autorizada:", error); }

    showLogin();

    setMessage(elements.loginMessage, "Esta cuenta de Google no está autorizada. Usá una de las dos cuentas habilitadas.", "error");

    return;

  }

  await showAuthenticatedApp(user);

});



// ---------- Selección de archivos ----------



function preserveManuallyEnteredMemoryDate() {
  state.memoryDateManuallyEdited = true;
  state.autoSuggestedMemoryDate = "";
}

elements.memoryDate?.addEventListener("input", preserveManuallyEnteredMemoryDate);
elements.memoryDate?.addEventListener("change", preserveManuallyEnteredMemoryDate);

elements.photoInput?.addEventListener("change", (event) => {

  addFiles(event.currentTarget.files);

  event.currentTarget.value = "";

});



elements.videoInput?.addEventListener("change", (event) => {

  addFiles(event.currentTarget.files);

  event.currentTarget.value = "";

});



elements.audioInput?.addEventListener("change", (event) => {

  addFiles(event.currentTarget.files);

  event.currentTarget.value = "";

});



// ---------- Cámara: foto y video ----------



async function startCamera() {

  if (!navigator.mediaDevices?.getUserMedia) {

    setMessage(elements.formMessage, "Este navegador no permite acceder a la cámara.", "error");

    return;

  }



  try {

    stopCamera();

    state.cameraStream = await navigator.mediaDevices.getUserMedia({

      video: { facingMode: { ideal: "environment" } },

      audio: false,

    });



    elements.cameraPreview.srcObject = state.cameraStream;

    elements.cameraPreview.hidden = false;

    elements.cameraPlaceholder.hidden = true;



    setButtonDisabled(elements.startCameraButton, true);

    setButtonDisabled(elements.takePhotoButton, false);

    setButtonDisabled(elements.startVideoButton, false);

    setButtonDisabled(elements.stopCameraButton, false);

    setMessage(elements.formMessage, "Cámara activada.");

  } catch (error) {

    console.error("No se pudo activar la cámara:", error);

    setMessage(

      elements.formMessage,

      "No se pudo activar la cámara. Revisá los permisos del navegador y que no esté siendo usada por otra aplicación.",

      "error",

    );

  }

}



function takePhoto() {

  const video = elements.cameraPreview;

  if (!state.cameraStream || !video.videoWidth || !video.videoHeight) {

    setMessage(elements.formMessage, "Esperá a que la cámara muestre la imagen y volvé a intentar.", "error");

    return;

  }



  const canvas = elements.photoCanvas;

  canvas.width = video.videoWidth;

  canvas.height = video.videoHeight;



  const context = canvas.getContext("2d");

  if (!context) {

    setMessage(elements.formMessage, "No se pudo preparar la captura de la foto.", "error");

    return;

  }



  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(

    (blob) => {

      if (!blob) {

        setMessage(elements.formMessage, "No se pudo generar el archivo de imagen.", "error");

        return;

      }



      const file = new File([blob], `foto-${new Date().toISOString().replaceAll(":", "-")}.jpg`, {

        type: "image/jpeg",

        lastModified: Date.now(),

      });

      addFiles([file]);

      setMessage(elements.formMessage, "Foto agregada a los archivos seleccionados.");

    },

    "image/jpeg",

    0.92,

  );

}



function startVideoRecording() {

  if (!state.cameraStream) {

    setMessage(elements.formMessage, "Primero activá la cámara.", "error");

    return;

  }



  if (typeof MediaRecorder === "undefined") {

    setMessage(elements.formMessage, "Este navegador no permite grabar video desde esta página.", "error");

    return;

  }



  try {

    state.videoChunks = [];

    const options = {};

    if (MediaRecorder.isTypeSupported?.("video/webm;codecs=vp9")) {

      options.mimeType = "video/webm;codecs=vp9";

    } else if (MediaRecorder.isTypeSupported?.("video/webm")) {

      options.mimeType = "video/webm";

    }



    state.videoRecorder = new MediaRecorder(state.cameraStream, options);

    state.videoRecorder.addEventListener("dataavailable", (event) => {

      if (event.data?.size) state.videoChunks.push(event.data);

    });



    state.videoRecorder.addEventListener("stop", () => {

      if (state.videoChunks.length) {

        const mimeType = state.videoRecorder?.mimeType || "video/webm";

        const blob = new Blob(state.videoChunks, { type: mimeType });

        const extension = mimeType.includes("mp4") ? "mp4" : "webm";

        const file = new File([blob], `video-${Date.now()}.${extension}`, {

          type: mimeType,

          lastModified: Date.now(),

        });

        addFiles([file]);

        setMessage(elements.formMessage, "Video agregado a los archivos seleccionados.");

      }

      state.videoChunks = [];

      state.videoRecorder = null;

      setButtonDisabled(elements.startVideoButton, false);

      setButtonDisabled(elements.stopVideoButton, true);

    });



    state.videoRecorder.start();

    setButtonDisabled(elements.startVideoButton, true);

    setButtonDisabled(elements.stopVideoButton, false);

    setMessage(elements.formMessage, "Grabando video...");

  } catch (error) {

    console.error("No se pudo iniciar la grabación de video:", error);

    setMessage(elements.formMessage, "No se pudo iniciar la grabación de video.", "error");

  }

}



function stopVideoRecording() {

  if (state.videoRecorder && state.videoRecorder.state !== "inactive") {

    state.videoRecorder.stop();

  }

}



function stopCamera() {

  if (state.videoRecorder && state.videoRecorder.state !== "inactive") {

    state.videoRecorder.stop();

  }



  stopStream(state.cameraStream);

  state.cameraStream = null;



  if (elements.cameraPreview) {

    elements.cameraPreview.pause();

    elements.cameraPreview.srcObject = null;

    elements.cameraPreview.hidden = true;

  }

  if (elements.cameraPlaceholder) elements.cameraPlaceholder.hidden = false;



  setButtonDisabled(elements.startCameraButton, false);

  setButtonDisabled(elements.takePhotoButton, true);

  setButtonDisabled(elements.startVideoButton, true);

  setButtonDisabled(elements.stopVideoButton, true);

  setButtonDisabled(elements.stopCameraButton, true);

}



elements.startCameraButton?.addEventListener("click", startCamera);

elements.takePhotoButton?.addEventListener("click", takePhoto);

elements.startVideoButton?.addEventListener("click", startVideoRecording);

elements.stopVideoButton?.addEventListener("click", stopVideoRecording);

elements.stopCameraButton?.addEventListener("click", stopCamera);



// ---------- Grabación de audio ----------



async function startAudioRecording() {

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {

    setMessage(elements.formMessage, "Este navegador no permite grabar audio desde esta página.", "error");

    return;

  }



  try {

    state.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    state.audioChunks = [];



    const options = {};

    if (MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus")) {

      options.mimeType = "audio/webm;codecs=opus";

    } else if (MediaRecorder.isTypeSupported?.("audio/webm")) {

      options.mimeType = "audio/webm";

    }



    state.audioRecorder = new MediaRecorder(state.audioStream, options);

    state.audioRecorder.addEventListener("dataavailable", (event) => {

      if (event.data?.size) state.audioChunks.push(event.data);

    });



    state.audioRecorder.addEventListener("stop", () => {

      if (state.audioChunks.length) {

        const mimeType = state.audioRecorder?.mimeType || "audio/webm";

        const blob = new Blob(state.audioChunks, { type: mimeType });

        const extension = mimeType.includes("mp4") ? "m4a" : "webm";

        const file = new File([blob], `audio-${Date.now()}.${extension}`, {

          type: mimeType,

          lastModified: Date.now(),

        });



        addFiles([file]);

        const previewUrl = registerObjectUrl(blob);

        elements.audioPreview.src = previewUrl;

        elements.audioPreview.hidden = false;

        setMessage(elements.formMessage, "Audio agregado a los archivos seleccionados.");

      }



      state.audioChunks = [];

      state.audioRecorder = null;

      stopStream(state.audioStream);

      state.audioStream = null;

      setButtonDisabled(elements.startAudioButton, false);

      setButtonDisabled(elements.stopAudioButton, true);

      elements.audioStatusIndicator.classList.remove("is-recording");

      elements.audioStatusText.textContent = "Grabación terminada";

    });



    state.audioRecorder.start();

    setButtonDisabled(elements.startAudioButton, true);

    setButtonDisabled(elements.stopAudioButton, false);

    elements.audioStatusIndicator.classList.add("is-recording");

    elements.audioStatusText.textContent = "Grabando audio...";

    setMessage(elements.formMessage, "");

  } catch (error) {

    console.error("No se pudo iniciar la grabación de audio:", error);

    stopStream(state.audioStream);

    state.audioStream = null;

    setMessage(

      elements.formMessage,

      "No se pudo acceder al micrófono. Revisá los permisos del navegador.",

      "error",

    );

  }

}



function stopAudioRecording() {

  if (state.audioRecorder && state.audioRecorder.state !== "inactive") {

    state.audioRecorder.stop();

  } else {

    stopStream(state.audioStream);

    state.audioStream = null;

    setButtonDisabled(elements.startAudioButton, false);

    setButtonDisabled(elements.stopAudioButton, true);

  }

}



elements.startAudioButton?.addEventListener("click", startAudioRecording);

elements.stopAudioButton?.addEventListener("click", stopAudioRecording);



// ---------- Carpetas (sin categorías) ----------

// Busca cada palabra por separado, sin exigir que estén pegadas en el título o la descripción.
function containsSearchTerms(text, query) {
  const normalizedText = String(text || "").toLocaleLowerCase("es-AR");
  const terms = String(query || "").toLocaleLowerCase("es-AR").split(/\s+/).filter(Boolean);
  return terms.every((term) => normalizedText.includes(term));
}

function refreshFolderOptions() {
  const selected = elements.memoryFolder.value || "";
  elements.memoryFolder.replaceChildren(new Option("Archivos sin carpeta asignada", ""));
  state.folders.forEach((folder) => {
    elements.memoryFolder.add(new Option(folder.title, folder.id));
  });
  if ([...elements.memoryFolder.options].some((option) => option.value === selected)) {
    elements.memoryFolder.value = selected;
  } else {
    elements.memoryFolder.value = "";
  }
}

async function createFolder(event) {
  event.preventDefault();
  const title = elements.folderTitle.value.trim();

  if (!state.backendReady) {
    setMessage(elements.folderFormMessage, "Todavía no hay conexión con Google Drive. No se guardó la carpeta.", "error");
    return;
  }
  if (!title) {
    setMessage(elements.folderFormMessage, "Ingresá un nombre para la carpeta.", "error");
    elements.folderTitle.focus();
    return;
  }
  if (state.folders.some((folder) => String(folder.title || "").toLocaleLowerCase("es-AR") === title.toLocaleLowerCase("es-AR"))) {
    setMessage(elements.folderFormMessage, "Ya existe una carpeta con ese nombre.", "error");
    return;
  }

  const submitButton = elements.folderForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    setMessage(elements.folderFormMessage, "Guardando carpeta en Google Drive...");
    const folder = await callDriveBridge("save-folder", { id: createId(), title });
    state.folders.push({ id: folder.id, title: folder.title, createdAt: folder.createdAt || new Date().toISOString() });
    elements.folderForm.reset();
    refreshFolderOptions();
    renderFolders();
    renderMemories();
    setMessage(elements.folderFormMessage, "Carpeta guardada en Google Drive.", "success");
  } catch (error) {
    console.error("No se pudo guardar la carpeta:", error);
    setMessage(elements.folderFormMessage, `No se pudo guardar la carpeta en Drive. ${error.message || error}`, "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

elements.folderForm?.addEventListener("submit", createFolder);

function setFolderFormOpen(open, focusInput = false) {
  state.folderFormOpen = Boolean(open);
  if (elements.folderForm) elements.folderForm.hidden = !state.folderFormOpen;

  if (state.folderFormOpen && focusInput) {
    window.requestAnimationFrame(() => {
      elements.folderForm?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

elements.cancelFolderButton?.addEventListener("click", () => {
  elements.folderForm?.reset();
  setMessage(elements.folderFormMessage, "");
  setFolderFormOpen(false);
});

elements.filtersToggle?.addEventListener("click", () => {
  const expanded = elements.filtersToggle.getAttribute("aria-expanded") !== "true";
  elements.filtersToggle.setAttribute("aria-expanded", String(expanded));
  if (elements.filtersContent) elements.filtersContent.hidden = !expanded;
  if (elements.filtersToggleIcon) elements.filtersToggleIcon.textContent = expanded ? "−" : "+";
});

function openFolder(folderId) {
  state.activeFolderId = folderId;
  // Al abrir una carpeta, mostrar sus archivos y mantener visible el panel de carpetas.
  // La selección de búsqueda global "Archivos" sigue disponible desde el filtro.
  elements.filterScope.value = "all";
  elements.search.value = "";
  renderMemories();

  // Llevar la vista al comienzo de los archivos, no al encabezado de la sección.
  // Si la carpeta está vacía, enfocar el mensaje que informa que no hay recuerdos.
  const resultsTarget = elements.activeFolderHeading && !elements.activeFolderHeading.hidden
    ? elements.activeFolderHeading
    : elements.memoriesEmpty.hidden
      ? elements.memoriesGrid
      : elements.memoriesEmpty;

  window.requestAnimationFrame(() => {
    if (!resultsTarget || resultsTarget.hidden) return;

    const headerHeight = $(".site-header")?.getBoundingClientRect().height || 0;
    const navigationHeight = $(".main-navigation")?.getBoundingClientRect().height || 0;
    const stickyOffset = headerHeight + navigationHeight + 12;
    const targetTop = window.scrollY + resultsTarget.getBoundingClientRect().top - stickyOffset;

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  });
}

async function renameFolder(folderId) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return;
  const proposed = window.prompt("Nuevo nombre de la carpeta:", folder.title);
  if (proposed === null) return;
  const title = proposed.trim();
  if (!title) {
    setMessage(elements.folderFormMessage, "El nombre de la carpeta no puede quedar vacío.", "error");
    return;
  }
  if (title.toLocaleLowerCase("es-AR") !== String(folder.title || "").toLocaleLowerCase("es-AR") &&
      state.folders.some((item) => item.id !== folderId && String(item.title || "").toLocaleLowerCase("es-AR") === title.toLocaleLowerCase("es-AR"))) {
    setMessage(elements.folderFormMessage, "Ya existe una carpeta con ese nombre.", "error");
    return;
  }
  if (!state.backendReady) {
    setMessage(elements.folderFormMessage, "No hay conexión con Google Drive. No se cambió el nombre.", "error");
    return;
  }

  try {
    setMessage(elements.folderFormMessage, "Actualizando nombre de la carpeta...");
    const updated = await callDriveBridge("rename-folder", { id: folderId, title });
    state.folders = state.folders.map((item) => item.id === folderId
      ? { id: updated.id, title: updated.title, createdAt: updated.createdAt || item.createdAt }
      : item);
    refreshFolderOptions();
    renderFolders();
    renderMemories();
    setMessage(elements.folderFormMessage, "Nombre de carpeta actualizado.", "success");
  } catch (error) {
    console.error("No se pudo renombrar la carpeta:", error);
    setMessage(elements.folderFormMessage, `No se pudo cambiar el nombre. ${error.message || error}`, "error");
  }
}

async function deleteFolder(folderId) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return;
  const count = state.memories.filter((memory) => memory.folderId === folderId).length;
  const message = count
    ? `¿Eliminar la carpeta «${folder.title}»? Sus ${count} recuerdos pasarán a «Archivos sin carpeta asignada». Los archivos no se borrarán de Drive.`
    : `¿Eliminar la carpeta «${folder.title}»? No se eliminarán archivos de Drive.`;
  if (!window.confirm(message)) return;
  if (!state.backendReady) {
    setMessage(elements.folderFormMessage, "No hay conexión con Google Drive. No se eliminó la carpeta.", "error");
    return;
  }

  try {
    setMessage(elements.folderFormMessage, "Eliminando carpeta y conservando sus recuerdos...");
    const result = await callDriveBridge("delete-folder", { id: folderId });
    state.folders = state.folders.filter((item) => item.id !== folderId);
    state.memories = state.memories.map((memory) => memory.folderId === folderId
      ? { ...memory, folderId: "", updatedAt: result.updatedAt || memory.updatedAt }
      : memory);
    if (state.activeFolderId === folderId) {
      state.activeFolderId = "unorganized";
      elements.filterScope.value = "all";
      elements.search.value = "";
    }
    refreshFolderOptions();
    renderFolders();
    renderMemories();
    const moved = Number.isFinite(result.movedCount) ? result.movedCount : count;
    setMessage(elements.folderFormMessage, `Carpeta eliminada. ${moved} recuerdo(s) conservado(s) en «Archivos sin carpeta asignada».`, "success");
  } catch (error) {
    console.error("No se pudo eliminar la carpeta:", error);
    setMessage(elements.folderFormMessage, `No se pudo eliminar la carpeta. ${error.message || error}`, "error");
  }
}

function renderFolders() {
  if (!elements.foldersGrid) return 0;
  elements.foldersGrid.replaceChildren();

  const query = elements.search.value.trim().toLocaleLowerCase("es-AR");
  const scope = elements.filterScope.value || "all";
  const filterFolderCards = (scope === "folders" || (scope === "all" && query.length > 0));
  const visibleFolders = state.folders.filter((folder) =>
    !filterFolderCards || !query || containsSearchTerms(folder.title, query));
  const showUnorganized = !filterFolderCards || !query || containsSearchTerms("Archivos sin carpeta asignada", query);

  const createCard = makeElement("article", "folder-card folder-card-create");
  const createButton = makeElement("button", "folder-card-open folder-card-create-button");
  createButton.type = "button";
  createButton.setAttribute("aria-label", "Crear una carpeta nueva");
  createButton.append(
    makeElement("strong", "", "Crear carpeta"),
    makeElement("span", "folder-card-create-plus", "+"),
  );
  createButton.addEventListener("click", () => setFolderFormOpen(true, true));
  createCard.append(createButton);
  elements.foldersGrid.append(createCard);

  const unorganizedCount = state.memories.filter((memory) => !memory.folderId).length;
  if (showUnorganized) {
    const card = makeElement("article", `folder-card folder-card-special${state.activeFolderId === "unorganized" ? " is-active" : ""}`);
    const openButton = makeElement("button", "folder-card-open");
    openButton.type = "button";
    openButton.setAttribute("aria-pressed", String(state.activeFolderId === "unorganized"));
    openButton.append(
      makeElement("span", "folder-card-icon", "🖼️"),
      makeElement("strong", "", "Archivos sin carpeta asignada"),
      makeElement("span", "folder-card-meta", `${unorganizedCount} ${unorganizedCount === 1 ? "archivo" : "archivos"}`),
    );
    openButton.addEventListener("click", () => openFolder("unorganized"));
    card.append(openButton);
    elements.foldersGrid.append(card);
  }

  visibleFolders.forEach((folder) => {
    const count = state.memories.filter((memory) => memory.folderId === folder.id).length;
    const card = makeElement("article", `folder-card${state.activeFolderId === folder.id ? " is-active" : ""}`);
    const openButton = makeElement("button", "folder-card-open");
    openButton.type = "button";
    openButton.setAttribute("aria-pressed", String(state.activeFolderId === folder.id));
    openButton.append(
      makeElement("span", "folder-card-icon", "🖼️"),
      makeElement("strong", "", folder.title),
      makeElement("span", "folder-card-meta", `${count} ${count === 1 ? "archivo" : "archivos"}`),
    );
    openButton.addEventListener("click", () => openFolder(folder.id));

    const actions = makeElement("div", "folder-card-actions");
    const renameButton = makeElement("button", "button button-quiet folder-card-action", "Renombrar");
    renameButton.type = "button";
    renameButton.addEventListener("click", () => renameFolder(folder.id));
    const deleteButton = makeElement("button", "button button-quiet folder-card-action", "Eliminar");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => deleteFolder(folder.id));
    actions.append(renameButton, deleteButton);
    card.append(openButton, actions);
    elements.foldersGrid.append(card);
  });

  if (elements.folderForm) elements.folderForm.hidden = !state.folderFormOpen;

  const totalVisible = visibleFolders.length + (showUnorganized ? 1 : 0);
  if (elements.foldersCount) {
    elements.foldersCount.textContent = `${totalVisible} ${totalVisible === 1 ? "carpeta" : "carpetas"}`;
  }
  return totalVisible;
}

// ---------- Guardar y editar (persistencia en Google Drive) ----------



function setMemoryEditingMode(active) {
  document.body.classList.toggle("is-editing-memory", active);
  elements.uploadSection?.classList.toggle("is-editing-active", active);

  // En modo edición no se permite seleccionar ni crear archivos nuevos.
  // Se conservan visibles los datos del recuerdo que sí se pueden modificar.
  if (elements.mediaSelectionFieldset) elements.mediaSelectionFieldset.hidden = active;
  if (elements.createSomethingFieldset) elements.createSomethingFieldset.hidden = active;

  const editingExistingFile = Boolean(active && state.editingMemory?.driveFileId);
  if (elements.existingFileDescriptionControl) {
    elements.existingFileDescriptionControl.hidden = !editingExistingFile;
  }
  if (elements.memoryDescriptionLabel) {
    elements.memoryDescriptionLabel.textContent = editingExistingFile
      ? "Descripción grupal"
      : "Texto del recuerdo (si no adjuntás archivos)";
  }
  if (elements.description) {
    elements.description.placeholder = editingExistingFile
      ? "Describí el contexto general de este recuerdo..."
      : "Escribí un recuerdo sin adjuntar archivos...";
  }

  // Bloquea también el foco por teclado fuera del editor, no solo los clics.
  document.querySelectorAll(".site-header, .main-navigation, #recuerdos, .site-footer")
    .forEach((element) => { element.inert = active; });

  const title = $("#upload-title");
  const eyebrow = $("#upload-eyebrow");
  if (title) title.textContent = active ? "Editar recuerdo" : "Sumá un recuerdo";
  if (eyebrow) eyebrow.textContent = active ? "Modificar un momento guardado" : "Guardar un momento";
}

function resetForm() {

  elements.memoryForm.reset();

  state.exifSuggestionRequest += 1;
  state.autoSuggestedMemoryDate = "";
  state.memoryDateManuallyEdited = false;

  elements.memoryId.value = "";
  if (elements.existingFileDescription) elements.existingFileDescription.value = "";

  releaseAllSelectedFilePreviews();
  state.selectedFiles = [];
  state.editingMemory = null;

  state.isEditing = false;

  setMemoryEditingMode(false);

  clearFileInputs();

  updateSelectedFiles();

  elements.saveButton.textContent = "Guardar recuerdo";

  elements.cancelEditButton.hidden = true;

  elements.uploadProgressArea.hidden = true;
  elements.uploadProgressArea.classList.remove("has-error");
  updateUploadProgress(0);
  setUploadSectionExpanded(false);

  setMessage(elements.formMessage, "");

}



function validateMemoryForm() {

  const description = elements.description.value.trim();

  const memoryDate = elements.memoryDate.value;

  const editingId = elements.memoryId.value;

  const invalidSelectedName = state.selectedFiles.find((entry) => !String(entry.fileName || "").trim());
  if (invalidSelectedName) {
    setMessage(elements.formMessage, `Ingresá un nombre para «${invalidSelectedName.file.name}».`, "error");
    elements.selectedFiles.querySelector(".selected-file-name-input")?.focus();
    return null;
  }

  if (state.isEditing && state.editingMemory?.driveFileId && state.selectedFiles.length === 0) {
    const parts = splitFileName(state.editingMemory.fileName || "");
    if (!composeFileName(elements.existingFileName?.value, parts.extension)) {
      setMessage(elements.formMessage, "El nombre del archivo no puede quedar vacío.", "error");
      elements.existingFileName?.focus();
      return null;
    }
  }

  if (state.selectedFiles.length === 0 && !description && !editingId) {

    setMessage(elements.formMessage, "Agregá al menos un archivo o escribí un recuerdo de texto.", "error");

    elements.description.focus();

    return null;

  }

  return { folderId: elements.memoryFolder.value || "", description, memoryDate, editingId };

}



async function saveMemory(event) {

  event.preventDefault();

  await updateMemoryDateSuggestion();
  const formData = validateMemoryForm();

  if (!formData) return;

  if (!state.backendReady) {

    setMessage(elements.formMessage, "No hay conexión con Google Drive. El recuerdo no se guardó; reconectá y volvé a intentar.", "error");

    return;

  }



  const { folderId, description, memoryDate, editingId } = formData;

  const existing = editingId ? state.memories.find((item) => item.id === editingId) : null;

  if (editingId && !existing) {

    setMessage(elements.formMessage, "No encontramos el recuerdo que querés editar. Actualizá la lista e intentá de nuevo.", "error");

    return;

  }



  elements.saveButton.disabled = true;

  elements.uploadProgressArea.hidden = false;

  elements.uploadProgressArea.classList.remove("has-error");

  updateUploadProgress(3, "Preparando el guardado...");



  try {

    if (existing) {

      const replacementEntry = state.selectedFiles[0] || null;
      const replacement = replacementEntry?.file || null;

      const payload = {

        id: existing.id,

        isEdit: true,

        folderId,

        // La descripción individual pertenece al archivo; la general es otro campo.

        description: existing.mediaType === "text"
          ? ""
          : (elements.existingFileDescription?.value.trim() ?? existing.description ?? ""),

        generalDescription: description,

        memoryDate,

      };

      if (replacementEntry) {
        payload.fileName = replacementEntry.fileName;
      } else if (existing.driveFileId) {
        const existingParts = splitFileName(existing.fileName || "");
        payload.fileName = composeFileName(elements.existingFileName?.value, existingParts.extension);
      }

      if (replacement) {

        updateUploadProgress(5, `Preparando archivo: ${replacement.name}`);

        payload.file = {

          name: replacementEntry.fileName,

          mimeType: replacement.type || "application/octet-stream",

          base64: await fileToBase64(replacement, (fraction) => {
            updateUploadProgress(5 + fraction * 35, `Preparando archivo: ${replacement.name}`);
          }),

          size: replacement.size,

        };

      }

      updateUploadProgress(replacement ? 40 : 15,
        replacement ? "Enviando a Google Drive (progreso estimado)..." : "Guardando cambios (progreso estimado)...");

      const stopEstimatedProgress = startEstimatedUploadProgress(replacement ? 40 : 15, 94);

      let saved;
      try {
        saved = await callDriveBridge("save-memory", payload);
      } finally {
        stopEstimatedProgress();
      }

      if (replacement && existing.fileUrl) revokeObjectUrl(existing.fileUrl);

      const updated = {

        ...saved,

        file: replacement || existing.file || null,

        fileUrl: replacement ? registerObjectUrl(replacement) : existing.fileUrl || "",

      };

      state.memories = state.memories.map((item) => item.id === existing.id ? updated : item);

    } else if (state.selectedFiles.length) {

      let completed = 0;

      const total = state.selectedFiles.length;

      for (const entry of state.selectedFiles) {

        const file = entry.file;
        const segmentStart = 5 + (completed / total) * 87;
        const segmentEnd = 5 + ((completed + 1) / total) * 87;
        const preparationEnd = segmentStart + (segmentEnd - segmentStart) * 0.45;
        const transferEnd = segmentStart + (segmentEnd - segmentStart) * 0.96;

        updateUploadProgress(segmentStart, `Preparando archivo ${completed + 1} de ${total}: ${file.name}`);

        const base64 = await fileToBase64(file, (fraction) => {
          updateUploadProgress(
            segmentStart + fraction * (preparationEnd - segmentStart),
            `Preparando archivo ${completed + 1} de ${total}: ${file.name}`,
          );
        });

        updateUploadProgress(preparationEnd, `Enviando ${completed + 1} de ${total} a Google Drive (progreso estimado): ${file.name}`);

        const stopEstimatedProgress = startEstimatedUploadProgress(preparationEnd, transferEnd);
        let saved;
        try {
          saved = await callDriveBridge("save-memory", {

            id: createId(),

            folderId,

            description: entry.description?.trim() || "",

            generalDescription: description,

            memoryDate,

            file: {

              name: entry.fileName,

              mimeType: file.type || "application/octet-stream",

              base64,

              size: file.size,

            },

          });
        } finally {
          stopEstimatedProgress();
        }

        state.memories.unshift({ ...saved, file, fileUrl: registerObjectUrl(file) });

        completed += 1;
        updateUploadProgress(segmentEnd, `Archivo ${completed} de ${total} guardado en Google Drive.`);
      }

    } else {

      updateUploadProgress(15, "Guardando texto en Drive (progreso estimado)...");

      const stopEstimatedProgress = startEstimatedUploadProgress(15, 94);
      let saved;
      try {
        saved = await callDriveBridge("save-memory", {

          id: createId(), folderId, description: "", generalDescription: description, memoryDate,

        });
      } finally {
        stopEstimatedProgress();
      }

      state.memories.unshift({ ...saved, file: null, fileUrl: "" });

    }



    updateUploadProgress(100, "Recuerdo guardado en Google Drive.");
    // Dejar visible el 100% un instante antes de cerrar el indicador.
    await new Promise((resolve) => window.setTimeout(resolve, 300));

    renderFolders();

    refreshFolderOptions();

    renderMemories();

    resetForm();

    setMessage(elements.formMessage, "Listo. El recuerdo quedó guardado en Google Drive.", "success");

    elements.uploadProgressArea.hidden = true;

    document.querySelector("#recuerdos")?.scrollIntoView({ behavior: "smooth", block: "start" });

  } catch (error) {

    console.error("Error al guardar el recuerdo en Google Drive:", error);

    elements.uploadProgressArea.classList.add("has-error");

    updateUploadProgress(
      elements.uploadProgress?.getAttribute("aria-valuenow") || 0,
      "No se pudo completar el guardado.",
    );

    setMessage(elements.formMessage, `No se confirmó el guardado en Google Drive. ${error.message || error}`, "error");

  } finally {

    elements.saveButton.disabled = false;

  }

}

elements.memoryForm?.addEventListener("submit", saveMemory);



elements.cancelEditButton?.addEventListener("click", () => {

  resetForm();

});



function editMemory(id) {

  const memory = state.memories.find((item) => item.id === id);

  if (!memory) return;



  resetForm();
  state.memoryDateManuallyEdited = true;

  elements.memoryId.value = memory.id;

  // El campo del formulario edita únicamente la descripción general.

  // Para recuerdos de texto antiguos, description era el único campo disponible.

  elements.description.value = memory.generalDescription || (memory.mediaType === "text" ? memory.description : "");
  if (elements.existingFileDescription) {
    elements.existingFileDescription.value = memory.description || "";
  }

  elements.memoryDate.value = memory.memoryDate;

  elements.memoryFolder.value = memory.folderId || "";

  state.editingMemory = memory;
  const existingNameParts = splitFileName(memory.fileName || "");
  if (elements.existingFileName) elements.existingFileName.value = existingNameParts.base;
  if (elements.existingFileExtension) elements.existingFileExtension.textContent = existingNameParts.extension;

  state.isEditing = true;
  updateSelectedFiles();

  setUploadSectionExpanded(true);
  setMemoryEditingMode(true);

  elements.saveButton.textContent = "Guardar cambios";

  elements.cancelEditButton.hidden = false;

  setMessage(

    elements.formMessage,

    "Editando este recuerdo. Podés modificar sus datos sin volver a subir el archivo.",

  );



  document.querySelector("#subir")?.scrollIntoView({ behavior: "smooth", block: "start" });

}



// ---------- Filtrar, ordenar y renderizar recuerdos ----------



function matchesFilters(memory) {
  const scope = elements.filterScope.value || "all";
  if (scope === "folders") return false;

  const search = elements.search.value.trim().toLocaleLowerCase("es-AR");
  const type = elements.filterType.value;
  const searchableText = [memory.fileName, memory.description, memory.generalDescription]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("es-AR");
  const matchesSearch = !search || containsSearchTerms(searchableText, search);
  // Una búsqueda por texto de archivos es global; sin texto se respeta la carpeta abierta.
  const matchesFolder = search
    ? true
    : (state.activeFolderId === "all" || (state.activeFolderId === "unorganized"
      ? !memory.folderId
      : memory.folderId === state.activeFolderId));
  return matchesSearch && matchesFolder && (!type || memory.mediaType === type);
}


function sortMemories(memories) {

  const sort = elements.sort.value;

  const sorted = [...memories];



  sorted.sort((a, b) => {

    switch (sort) {

      case "uploaded-asc":

        return new Date(a.uploadedAt) - new Date(b.uploadedAt);

      case "memory-desc":

        return (b.memoryDate || "").localeCompare(a.memoryDate || "");

      case "memory-asc":

        return (a.memoryDate || "").localeCompare(b.memoryDate || "");

      case "description-asc":

        return `${a.generalDescription || ""} ${a.description || ""}`.localeCompare(`${b.generalDescription || ""} ${b.description || ""}`, "es-AR");

      case "description-desc":

        return `${b.generalDescription || ""} ${b.description || ""}`.localeCompare(`${a.generalDescription || ""} ${a.description || ""}`, "es-AR");

      case "uploaded-desc":

      default:

        return new Date(b.uploadedAt) - new Date(a.uploadedAt);

    }

  });



  return sorted;

}



function makeElement(tag, className, text) {

  const element = document.createElement(tag);

  if (className) element.className = className;

  if (text !== undefined) element.textContent = text;

  return element;

}



// ---------- Visor de fotos ampliadas ----------

let photoZoom = 1;

const MIN_PHOTO_ZOOM = 1;

const MAX_PHOTO_ZOOM = 5;

const PHOTO_ZOOM_STEP = 0.25;



function updatePhotoZoom(nextZoom) {

  photoZoom = Math.min(MAX_PHOTO_ZOOM, Math.max(MIN_PHOTO_ZOOM, nextZoom));

  const image = elements.photoViewerImage;

  const stage = elements.photoViewerStage;



  if (image && stage && image.naturalWidth && image.naturalHeight) {

    const availableWidth = Math.max(1, stage.clientWidth - 24);

    const availableHeight = Math.max(1, stage.clientHeight - 24);

    // Ajusta la foto al mayor tamaño posible dentro del área visible, sin deformarla.
    // Se permite ampliar imágenes pequeñas para aprovechar también pantallas grandes.
    const fitScale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight);

    image.style.maxWidth = "none";

    image.style.maxHeight = "none";

    image.style.width = `${image.naturalWidth * fitScale * photoZoom}px`;

    image.style.height = `${image.naturalHeight * fitScale * photoZoom}px`;

  }



  if (elements.photoZoomLevel) elements.photoZoomLevel.textContent = `${Math.round(photoZoom * 100)}%`;

  if (elements.photoZoomOut) elements.photoZoomOut.disabled = photoZoom <= MIN_PHOTO_ZOOM;

  if (elements.photoZoomIn) elements.photoZoomIn.disabled = photoZoom >= MAX_PHOTO_ZOOM;

}



function openPhotoViewer(memory) {

  if (!elements.photoViewerDialog || !elements.photoViewerImage || !memory.fileUrl) return;

  elements.photoViewerImage.src = memory.fileUrl;

  elements.photoViewerImage.alt = memory.description || memory.generalDescription || memory.fileName || "Foto ampliada";

  elements.photoViewerImage.onload = () => updatePhotoZoom(1);

  if (elements.photoViewerCaption) elements.photoViewerCaption.textContent = memory.description || memory.generalDescription || memory.fileName || "Foto";

  if (elements.photoViewerStage) elements.photoViewerStage.scrollTop = 0;

  if (typeof elements.photoViewerDialog.showModal === "function") {

    elements.photoViewerDialog.showModal();

    updatePhotoZoom(1);

  }

}



function closePhotoViewer() {

  if (elements.photoViewerDialog?.open) elements.photoViewerDialog.close();

}



// Recalcular el ajuste cuando cambia la orientación o el área visible del navegador móvil.
function refreshPhotoViewerFit() {
  if (!elements.photoViewerDialog?.open || !elements.photoViewerImage?.naturalWidth) return;

  window.requestAnimationFrame(() => {
    if (!elements.photoViewerDialog?.open) return;
    updatePhotoZoom(photoZoom);
  });
}

window.addEventListener("resize", refreshPhotoViewerFit);
window.visualViewport?.addEventListener("resize", refreshPhotoViewerFit);



// ---------- Reproductor de videos ----------

function resetVideoViewer() {
  const video = elements.videoViewerPlayer;
  if (!video) return;

  video.pause();
  video.removeAttribute("src");
  video.load();
  if (elements.videoViewerStatus) {
    elements.videoViewerStatus.textContent = "";
    elements.videoViewerStatus.hidden = true;
  }
}

function openVideoViewer(memory) {
  const dialog = elements.videoViewerDialog;
  const video = elements.videoViewerPlayer;
  if (!dialog || !video || !memory?.fileUrl) return;

  resetVideoViewer();
  if (elements.videoViewerTitle) {
    elements.videoViewerTitle.textContent = memory.fileName || memory.description || "Reproduciendo video";
  }
  if (elements.videoViewerStatus) elements.videoViewerStatus.hidden = true;

  video.controls = true;
  video.autoplay = true;
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";
  video.src = memory.fileUrl;
  video.load();

  if (!dialog.open) dialog.showModal();

  // La solicitud se realiza directamente desde el clic del usuario.
  // Si el navegador no permite Fullscreen API, el diálogo ya ocupa la pantalla.
  try {
    if (typeof video.requestFullscreen === "function") {
      const fullscreenRequest = video.requestFullscreen();
      fullscreenRequest?.catch(() => {
        // El reproductor permanece abierto dentro del diálogo como alternativa.
      });
    } else if (typeof video.webkitEnterFullscreen === "function") {
      video.webkitEnterFullscreen();
    }
  } catch (error) {
    console.info("El navegador mantendrá el video dentro del visor de la aplicación:", error);
  }

  const playback = video.play();
  playback?.catch((error) => {
    console.warn("El navegador no pudo iniciar automáticamente el video:", error);
    if (elements.videoViewerStatus) {
      elements.videoViewerStatus.textContent = "Tocá reproducir en los controles del video para comenzar.";
      elements.videoViewerStatus.hidden = false;
    }
  });
}

function closeVideoViewer() {
  const video = elements.videoViewerPlayer;
  const dialog = elements.videoViewerDialog;
  if (!video || !dialog) return;

  if (document.fullscreenElement === video && typeof document.exitFullscreen === "function") {
    document.exitFullscreen().catch(() => {}).finally(() => {
      if (dialog.open) dialog.close();
      else resetVideoViewer();
    });
    return;
  }

  if (video.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === "function") {
    try { video.webkitExitFullscreen(); } catch (_) { /* El diálogo igual puede cerrarse. */ }
  }

  if (dialog.open) dialog.close();
  else resetVideoViewer();
}

// El evento close también cubre el cierre mediante Escape del diálogo.
elements.videoViewerDialog?.addEventListener("close", resetVideoViewer);
elements.videoViewerClose?.addEventListener("click", closeVideoViewer);
elements.videoViewerDialog?.addEventListener("click", (event) => {
  if (event.target === elements.videoViewerDialog) closeVideoViewer();
});
elements.videoViewerPlayer?.addEventListener("error", () => {
  if (!elements.videoViewerStatus) return;
  elements.videoViewerStatus.textContent = "No se pudo reproducir este video. El formato podría no ser compatible con el navegador.";
  elements.videoViewerStatus.hidden = false;
});



elements.photoZoomIn?.addEventListener("click", () => updatePhotoZoom(photoZoom + PHOTO_ZOOM_STEP));

elements.photoZoomOut?.addEventListener("click", () => updatePhotoZoom(photoZoom - PHOTO_ZOOM_STEP));

elements.photoZoomReset?.addEventListener("click", () => {

  updatePhotoZoom(1);

  if (elements.photoViewerStage) {

    elements.photoViewerStage.scrollTop = 0;

    elements.photoViewerStage.scrollLeft = 0;

  }

});

elements.photoViewerClose?.addEventListener("click", closePhotoViewer);

elements.photoViewerDialog?.addEventListener("click", (event) => {

  if (event.target === elements.photoViewerDialog) closePhotoViewer();

});

elements.photoViewerImage?.addEventListener("wheel", (event) => {

  if (!elements.photoViewerDialog?.open || !event.ctrlKey) return;

  event.preventDefault();

  updatePhotoZoom(photoZoom + (event.deltaY < 0 ? PHOTO_ZOOM_STEP : -PHOTO_ZOOM_STEP));

}, { passive: false });



function renderMemoryMedia(memory) {

  const container = makeElement("div", "memory-card-media");



  if (!memory.fileUrl && memory.driveFileId && memory.mediaType !== "text") {

    container.dataset.memoryId = memory.id;

    container.classList.add("memory-card-media-pending");

    container.append(makeElement("div", "memory-card-text-preview", "Cargando archivo desde Drive…"));

    return container;

  }



  if (memory.mediaType === "image" && memory.fileUrl) {

    const image = document.createElement("img");

    image.src = memory.fileUrl;

    image.alt = memory.description || memory.generalDescription || memory.fileName || "Foto de un recuerdo";

    image.loading = "lazy";

    image.tabIndex = 0;

    image.setAttribute("role", "button");

    image.setAttribute("aria-label", `Ampliar foto: ${image.alt}`);

    image.addEventListener("click", () => openPhotoViewer(memory));

    image.addEventListener("keydown", (event) => {

      if (event.key === "Enter" || event.key === " ") {

        event.preventDefault();

        openPhotoViewer(memory);

      }

    });

    container.append(image);

  } else if (memory.mediaType === "video" && memory.fileUrl) {

    const preview = makeElement("div", "memory-card-video-preview");
    const video = document.createElement("video");
    video.src = memory.fileUrl;
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.tabIndex = -1;
    video.setAttribute("aria-hidden", "true");

    const playButton = makeElement("button", "memory-card-video-play-button");
    playButton.type = "button";
    playButton.setAttribute("aria-label", `Reproducir video: ${memory.fileName || memory.description || "recuerdo"}`);
    playButton.title = "Reproducir video";
    playButton.append(makeElement("span", "memory-card-video-play-icon", "▶"));
    playButton.addEventListener("click", () => openVideoViewer(memory));

    preview.append(video, playButton);
    container.append(preview);

  } else if (memory.mediaType === "audio" && memory.fileUrl) {

    const audio = document.createElement("audio");

    audio.src = memory.fileUrl;

    audio.controls = true;

    audio.preload = "metadata";

    container.append(audio);

  } else {

    const preview = makeElement(

      "div",

      "memory-card-text-preview",

      memory.mediaType === "text" ? "Un recuerdo escrito" : (memory.mediaType === "file" ? "Archivo guardado" : "Archivo"),

    );

    container.append(preview);

  }

  return container;

}



async function loadDriveMediaForContainer(container) {

  const memoryId = container.dataset.memoryId;

  const memory = state.memories.find((item) => item.id === memoryId);

  if (!memory || !memory.driveFileId || memory.fileUrl || container.dataset.loading === "true") return;

  container.dataset.loading = "true";

  try {

    const media = await callDriveBridge("get-media", { fileId: memory.driveFileId });

    const current = state.memories.find((item) => item.id === memoryId);

    if (!current) return;

    current.fileUrl = media.dataUrl;

    const replacement = renderMemoryMedia(current);

    container.replaceWith(replacement);

  } catch (error) {

    console.error(`No se pudo cargar el archivo ${memory.fileName} desde Drive:`, error);

    container.replaceChildren(makeElement("div", "memory-card-text-preview", "No se pudo cargar. Recargá e intentá otra vez."));

    container.dataset.loading = "false";

  }

}



function activateLazyDriveMediaLoading() {

  const pending = elements.memoriesGrid.querySelectorAll(".memory-card-media[data-memory-id]");

  if (!pending.length) return;

  if (!("IntersectionObserver" in window)) {

    pending.forEach((container) => loadDriveMediaForContainer(container));

    return;

  }

  const observer = new IntersectionObserver((entries) => {

    entries.forEach((entry) => {

      if (!entry.isIntersecting) return;

      observer.unobserve(entry.target);

      loadDriveMediaForContainer(entry.target);

    });

  }, { rootMargin: "250px" });

  pending.forEach((container) => observer.observe(container));

}



function renderMemoryCard(memory) {

  const card = makeElement("article", "memory-card");

  card.append(renderMemoryMedia(memory));



  const body = makeElement("div", "memory-card-body");

  const topline = makeElement("div", "memory-card-topline");

  topline.append(

    makeElement("span", "memory-folder", state.folders.find((folder) => folder.id === memory.folderId)?.title || "Archivos sin carpeta asignada"),

    makeElement("span", "memory-type", ({

      image: "Foto",

      video: "Video",

      audio: "Audio",

      text: "Texto",

      file: "Archivo",

    })[memory.mediaType] || "Archivo"),

  );



  const title = makeElement(

    "h2",

    "memory-card-title",

    memory.fileName || ((memory.generalDescription || memory.description) ? "Recuerdo escrito" : "Recuerdo sin título"),

  );



  // Description individual (archivo) y general se muestran en apartados separados.

  const individualText = memory.mediaType === "text" ? "" : (memory.description || "");

  const description = makeElement("p", "memory-card-description", individualText);

  description.hidden = !individualText;



  const generalText = memory.generalDescription || (memory.mediaType === "text" ? memory.description : "");

  const generalDescription = makeElement(

    "p",

    "memory-card-description memory-card-general-description",

    generalText ? `Descripción general: ${generalText}` : "",

  );

  generalDescription.hidden = !generalText;



  const dates = makeElement("div", "memory-card-dates");

  const memoryDate = makeElement("div", "memory-card-date");

  memoryDate.append(

    makeElement("strong", "", "Fecha del recuerdo"),

    makeElement("span", "", formatMemoryDate(memory.memoryDate)),

  );



  const uploadedDate = makeElement("div", "memory-card-date");

  uploadedDate.append(

    makeElement("strong", "", "Fecha de subida"),

    makeElement("span", "", formatDateTime(memory.uploadedAt)),

  );

  dates.append(memoryDate, uploadedDate);



  const actions = makeElement("div", "memory-card-actions");

  const editButton = makeElement("button", "button button-secondary", "Editar");

  editButton.type = "button";

  editButton.addEventListener("click", () => editMemory(memory.id));



  const deleteButton = makeElement("button", "button button-quiet", "Eliminar");

  deleteButton.type = "button";

  deleteButton.addEventListener("click", () => askDeleteMemory(memory.id));



  const moveLabel = makeElement("label", "move-memory-label", "Mover a carpeta");

  const moveSelect = document.createElement("select");

  moveSelect.className = "move-memory-select";

  moveSelect.setAttribute("aria-label", `Mover ${memory.fileName || "recuerdo"} a una carpeta`);

  moveSelect.add(new Option("Archivos sin carpeta asignada", ""));

  state.folders.forEach((folder) => moveSelect.add(new Option(folder.title, folder.id)));

  moveSelect.value = memory.folderId || "";

  moveSelect.addEventListener("change", async () => {

    const previousFolderId = memory.folderId || "";

    const nextFolderId = moveSelect.value;

    if (!state.backendReady) {

      moveSelect.value = previousFolderId;

      setMessage(elements.formMessage, "No hay conexión con Google Drive; no se movió el recuerdo.", "error");

      return;

    }

    moveSelect.disabled = true;

    try {

      const result = await callDriveBridge("move-memory", { id: memory.id, folderId: nextFolderId });

      memory.folderId = result.folderId || "";

      memory.updatedAt = result.updatedAt;

      renderFolders();

      renderMemories();

    } catch (error) {

      console.error("No se pudo mover el recuerdo:", error);

      moveSelect.value = previousFolderId;

      setMessage(elements.formMessage, `No se pudo mover el recuerdo. ${error.message || error}`, "error");

    } finally {

      moveSelect.disabled = false;

    }

  });

  moveLabel.append(moveSelect);

  actions.append(moveLabel, editButton, deleteButton);

  body.append(topline, title, description, generalDescription, dates, actions);

  card.append(body);



  return card;

}



function renderMemories() {
  if (!elements.memoriesGrid) return;

  elements.memoriesGrid.replaceChildren();
  elements.memoriesLoading.hidden = true;
  elements.memoriesError.hidden = true;

  const scope = elements.filterScope.value || "all";
  const folderSearchOnly = scope === "folders";
  const typeControl = $("#filter-type-control");
  const sortControl = $("#sort-control");
  if (typeControl) typeControl.hidden = folderSearchOnly;
  if (sortControl) sortControl.hidden = folderSearchOnly;
  $(".memory-tools")?.classList.toggle("folder-search-mode", folderSearchOnly);

  const visibleFolderCount = renderFolders();
  const folderManagement = $("#folder-management");
  if (folderManagement) folderManagement.hidden = scope === "files";
  const activeFolder = state.folders.find((folder) => folder.id === state.activeFolderId);
  const activeFolderTitle = activeFolder?.title || (state.activeFolderId === "unorganized"
    ? "Archivos sin carpeta asignada"
    : "");
  const showActiveFolderTitle = scope !== "folders" && Boolean(activeFolderTitle);

  if (elements.activeFolderHeading) {
    elements.activeFolderHeading.hidden = !showActiveFolderTitle;
  }
  if (elements.activeFolderTitle) {
    elements.activeFolderTitle.textContent = showActiveFolderTitle ? activeFolderTitle : "";
  }

  const sectionTitle = $("#memories-title");
  if (sectionTitle) {
    sectionTitle.textContent = scope === "folders" && elements.search.value.trim()
      ? "Buscar carpetas"
      : "Nuestros recuerdos";
  }

  if (scope === "folders") {
    elements.memoriesGrid.hidden = true;
    elements.memoriesEmpty.hidden = true;
    elements.memoriesCount.textContent = `${visibleFolderCount} ${visibleFolderCount === 1 ? "carpeta encontrada" : "carpetas encontradas"}`;
    return;
  }

  elements.memoriesGrid.hidden = false;
  const filtered = sortMemories(state.memories.filter(matchesFilters));
  elements.memoriesCount.textContent = `${filtered.length} ${filtered.length === 1 ? "recuerdo" : "recuerdos"}`;

  if (filtered.length === 0) {
    elements.memoriesEmpty.hidden = false;
    return;
  }

  elements.memoriesEmpty.hidden = true;
  const fragment = document.createDocumentFragment();
  filtered.forEach((memory) => fragment.append(renderMemoryCard(memory)));
  elements.memoriesGrid.append(fragment);
  activateLazyDriveMediaLoading();
}


// Al buscar archivos, la búsqueda de texto abarca todas las carpetas. La búsqueda
// de carpetas se hace por el nombre; las carpetas no tienen descripción.
function handleSearchChange() {
  if (elements.search.value.trim() && elements.filterScope.value !== "folders") {
    state.activeFolderId = "all";
  }
  renderMemories();
}

elements.search?.addEventListener("input", handleSearchChange);
elements.search?.addEventListener("change", handleSearchChange);

elements.filterScope?.addEventListener("change", () => {
  if (elements.filterScope.value !== "folders") {
    state.activeFolderId = "all";
  }
  renderMemories();
});

[elements.filterType, elements.sort].forEach((control) => {
  control?.addEventListener("input", renderMemories);
  control?.addEventListener("change", renderMemories);
});

elements.clearFiltersButton?.addEventListener("click", () => {
  elements.search.value = "";
  elements.filterScope.value = "folders";
  elements.filterType.value = "";
  state.activeFolderId = "all";
  elements.sort.value = "uploaded-desc";
  renderMemories();
});

elements.showAllMemoriesButton?.addEventListener("click", () => {
  state.activeFolderId = "all";
  elements.filterScope.value = "files";
  elements.search.value = "";
  renderMemories();
});

elements.retryMemoriesButton?.addEventListener("click", async () => {

  try { await refreshDataFromDrive(); }

  catch (_) { /* refreshDataFromDrive ya muestra el error */ }

});



// ---------- Eliminar recuerdos (confirmación) ----------



function askDeleteMemory(id) {

  state.pendingDeleteId = id;

  if (typeof elements.deleteDialog.showModal === "function") {

    elements.deleteDialog.showModal();

  } else {

    const accepted = window.confirm("¿Querés eliminar este recuerdo de Google Drive?");

    if (accepted) deleteMemory(id);

  }

}



function closeDeleteDialog() {

  if (elements.deleteDialog.open) elements.deleteDialog.close("cancel");

  state.pendingDeleteId = null;

}



elements.cancelDeleteButton?.addEventListener("click", (event) => {

  event.preventDefault();

  closeDeleteDialog();

});



elements.confirmDeleteButton?.addEventListener("click", (event) => {

  event.preventDefault();

  if (state.pendingDeleteId) deleteMemory(state.pendingDeleteId);

  closeDeleteDialog();

});



async function deleteMemory(id) {

  const memory = state.memories.find((item) => item.id === id);

  if (!memory) return;

  if (!state.backendReady) {

    setMessage(elements.formMessage, "No hay conexión con Google Drive; no se eliminó el recuerdo.", "error");

    return;

  }

  try {

    await callDriveBridge("delete-memory", { id });

    revokeObjectUrl(memory.fileUrl);

    state.memories = state.memories.filter((item) => item.id !== id);

    renderFolders();

    renderMemories();

    setMessage(elements.formMessage, "Recuerdo eliminado de Google Drive.", "success");

  } catch (error) {

    console.error("No se pudo eliminar el recuerdo:", error);

    setMessage(elements.formMessage, `No se pudo eliminar el recuerdo de Drive. ${error.message || error}`, "error");

  }

}



// ---------- Navegación de las dos secciones ----------



document.querySelectorAll("[data-section-link]").forEach((link) => {

  link.addEventListener("click", () => {

    document.querySelectorAll("[data-section-link]").forEach((item) => {

      item.removeAttribute("aria-current");

    });

    link.setAttribute("aria-current", "page");

    if (link.dataset.sectionLink === "subir") {
      setUploadSectionExpanded(true);
    }

  });

});



// ---------- Limpieza de recursos del navegador ----------



window.addEventListener("beforeunload", () => {

  stopStream(state.cameraStream);

  stopStream(state.audioStream);

  for (const url of state.objectUrls) URL.revokeObjectURL(url);

});



// ---------- Inicio ----------



updateSelectedFiles();


refreshFolderOptions();

renderFolders();

elements.memoriesLoading.hidden = true;

elements.memoriesEmpty.hidden = true;

elements.memoriesError.hidden = true;

showLogin();
