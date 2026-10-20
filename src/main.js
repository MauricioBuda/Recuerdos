import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase.js";

// ============================================================
// NUESTROS RECUERDOS — lógica inicial de la interfaz
// Archivo: src/main.js
//
// Esta versión funciona localmente durante la sesión del navegador.
// Todavía NO guarda datos en Firebase ni archivos en Google Drive.
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
  memoryId: $("#memory-id"),
  memoryFolder: $("#memory-folder"),
  folderForm: $("#folder-form"),
  folderTitle: $("#folder-title"),
  folderCategory: $("#folder-category"),
  newFolderCategoryControl: $("#new-folder-category-control"),
  newFolderCategory: $("#new-folder-category"),
  folderFormMessage: $("#folder-form-message"),
  foldersGrid: $("#folders-grid"),
  showAllMemoriesButton: $("#show-all-memories-button"),
  showUnorganizedButton: $("#show-unorganized-button"),
  photoInput: $("#photo-input"),
  videoInput: $("#video-input"),
  audioInput: $("#audio-input"),
  selectedFiles: $("#selected-files"),
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
  uploadProgress: $("#upload-progress"),

  search: $("#memory-search"),
  filterCategory: $("#filter-category"),
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
};

const state = {
  selectedFiles: [],
  memories: [],
  folders: [],
  activeFolderId: "all",
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
};

// Las tres cuentas autorizadas se configurarán en Firebase.
// No se debe usar el modo local como control de seguridad.

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

function updateSelectedFiles() {
  elements.selectedFiles.replaceChildren();

  if (state.selectedFiles.length === 0) {
    const message = document.createElement("p");
    message.className = "muted-text";
    message.textContent = "Todavía no seleccionaste ningún archivo.";
    elements.selectedFiles.append(message);
    return;
  }

  state.selectedFiles.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "selected-file-item";

    const name = document.createElement("span");
    name.className = "selected-file-name";
    name.textContent = `${entry.file.name} · ${formatBytes(entry.file.size)}`;

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
    removeButton.className = "button button-quiet";
    removeButton.type = "button";
    removeButton.textContent = "Quitar";
    removeButton.setAttribute("aria-label", `Quitar ${entry.file.name}`);
    removeButton.addEventListener("click", () => {
      state.selectedFiles = state.selectedFiles.filter((item) => item.id !== entry.id);
      updateSelectedFiles();
    });

    row.append(name, descriptionLabel, removeButton);
    elements.selectedFiles.append(row);
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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
      state.selectedFiles.push({ id: createId(), file });
    }
  }

  updateSelectedFiles();
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
// Reemplazá los tres textos de ejemplo por las tres direcciones autorizadas.
// Esto controla el acceso a la interfaz; la seguridad definitiva también debe
// aplicarse en el backend antes de habilitar el almacenamiento en Google Drive.
const AUTHORIZED_EMAILS = [
  "mauricio.ariel.buda@gmail.com",
  "wakeuprodiaz@gmail.com",
  "recuerdos.mau.roci@gmail.com",
].map((email) => email.trim().toLocaleLowerCase("es-AR"));

let isSigningIn = false;

function showAuthenticatedApp(user) {
  elements.loginSection.hidden = true;
  elements.privateApp.hidden = false;
  elements.currentUser.hidden = false;
  elements.currentUser.textContent = user.displayName || user.email || "Sesión iniciada";
  elements.signOutButton.hidden = false;
  setMessage(
    elements.loginMessage,
    "Sesión iniciada con Google. Los recuerdos todavía se guardan solo durante esta sesión y no se almacenan en Drive.",
    "success",
  );
  renderFolders();
  renderMemories();
}

function showLogin() {
  stopCamera();
  stopAudioRecording();
  elements.privateApp.hidden = true;
  elements.loginSection.hidden = false;
  elements.currentUser.hidden = true;
  elements.signOutButton.hidden = true;
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
      setMessage(
        elements.loginMessage,
        "Esta cuenta de Google no está autorizada para ingresar. Usá una de las tres cuentas habilitadas.",
        "error",
      );
      return;
    }

    showAuthenticatedApp(result.user);
  } catch (error) {
    console.error("Error al iniciar sesión con Google:", error);
    let message = "No se pudo iniciar sesión. Volvé a intentarlo.";
    if (error?.code === "auth/popup-closed-by-user") {
      message = "Se cerró la ventana de inicio de sesión antes de completar el acceso.";
    } else if (error?.code === "auth/unauthorized-domain") {
      message = "Este dominio no está autorizado en Firebase Authentication. Revisá los dominios autorizados del proyecto.";
    } else if (error?.code === "auth/popup-blocked") {
      message = "El navegador bloqueó la ventana emergente. Permití las ventanas emergentes para este sitio y volvé a intentarlo.";
    }
    setMessage(elements.loginMessage, message, "error");
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

  const email = user.email?.trim().toLocaleLowerCase("es-AR");
  if (!email || !AUTHORIZED_EMAILS.includes(email)) {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("No se pudo cerrar la sesión de una cuenta no autorizada:", error);
    }
    showLogin();
    setMessage(
      elements.loginMessage,
      "Esta cuenta de Google no está autorizada para ingresar. Usá una de las tres cuentas habilitadas.",
      "error",
    );
    return;
  }

  showAuthenticatedApp(user);
});

// ---------- Selección de archivos ----------

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

// ---------- Carpetas y categorías ----------
function updateFolderCategoryControl() {
  const creating = elements.folderCategory.value === "__crear__";
  elements.newFolderCategoryControl.hidden = !creating;
  elements.newFolderCategory.required = creating;
  if (!creating) elements.newFolderCategory.value = "";
}

elements.folderCategory?.addEventListener("change", updateFolderCategoryControl);

function getFolderCategory() {
  const value = elements.folderCategory.value;
  if (value !== "__crear__") return value;
  const category = elements.newFolderCategory.value.trim();
  if (!category) return "";
  const existing = Array.from(elements.folderCategory.options).find(o => o.value.toLocaleLowerCase("es-AR") === category.toLocaleLowerCase("es-AR"));
  if (existing) return existing.value;
  const option = document.createElement("option");
  option.value = category;
  option.textContent = category;
  elements.folderCategory.insertBefore(option, elements.folderCategory.querySelector('option[value="__crear__"]'));
  return category;
}

function refreshFolderOptions() {
  const selected = elements.memoryFolder.value;
  elements.memoryFolder.replaceChildren();
  const unorganized = new Option("Sin organizar", "");
  elements.memoryFolder.add(unorganized);
  state.folders.forEach(folder => elements.memoryFolder.add(new Option(`${folder.title} · ${folder.category}`, folder.id)));
  if ([...elements.memoryFolder.options].some(option => option.value === selected)) elements.memoryFolder.value = selected;

  const selectedCategory = elements.filterCategory.value;
  elements.filterCategory.replaceChildren(new Option("Todas las categorías", ""));
  [...new Set(state.folders.map(folder => folder.category))].sort((a,b)=>a.localeCompare(b,"es-AR")).forEach(category => elements.filterCategory.add(new Option(category, category)));
  elements.filterCategory.value = [...elements.filterCategory.options].some(o => o.value === selectedCategory) ? selectedCategory : "";
}

function createFolder(event) {
  event.preventDefault();
  const title = elements.folderTitle.value.trim();
  const category = getFolderCategory();
  if (!title || !category) {
    setMessage(elements.folderFormMessage, "Ingresá un título y elegí una categoría para la carpeta.", "error");
    return;
  }
  if (state.folders.some(folder => folder.title.toLocaleLowerCase("es-AR") === title.toLocaleLowerCase("es-AR"))) {
    setMessage(elements.folderFormMessage, "Ya existe una carpeta con ese título.", "error");
    return;
  }
  state.folders.push({ id: createId(), title, category, createdAt: new Date().toISOString() });
  elements.folderForm.reset();
  updateFolderCategoryControl();
  refreshFolderOptions();
  renderFolders();
  setMessage(elements.folderFormMessage, "Carpeta creada en esta sesión.", "success");
}
elements.folderForm?.addEventListener("submit", createFolder);

function renderFolders() {
  if (!elements.foldersGrid) return;
  elements.foldersGrid.replaceChildren();
  const allCard = makeElement("button", "folder-card folder-card-special");
  allCard.type = "button";
  allCard.append(makeElement("span", "folder-card-icon", "▤"), makeElement("strong", "", "Todos los recuerdos"), makeElement("span", "folder-card-meta", `${state.memories.length} archivos`));
  allCard.addEventListener("click", () => { state.activeFolderId = "all"; renderMemories(); document.querySelector("#recuerdos")?.scrollIntoView({behavior:"smooth"}); });
  elements.foldersGrid.append(allCard);
  const unorganized = state.memories.filter(memory => !memory.folderId);
  const unorganizedCard = makeElement("button", "folder-card folder-card-special");
  unorganizedCard.type = "button";
  unorganizedCard.append(makeElement("span", "folder-card-icon", "＋"), makeElement("strong", "", "Sin organizar"), makeElement("span", "folder-card-meta", `${unorganized.length} archivos`));
  unorganizedCard.addEventListener("click", () => { state.activeFolderId = "unorganized"; renderMemories(); document.querySelector("#recuerdos")?.scrollIntoView({behavior:"smooth"}); });
  elements.foldersGrid.append(unorganizedCard);
  state.folders.forEach(folder => {
    const count = state.memories.filter(memory => memory.folderId === folder.id).length;
    const card = makeElement("button", "folder-card");
    card.type = "button";
    card.append(makeElement("span", "folder-card-icon", "▰"), makeElement("strong", "", folder.title), makeElement("span", "folder-card-category", folder.category), makeElement("span", "folder-card-meta", `${count} ${count === 1 ? "archivo" : "archivos"}`));
    card.addEventListener("click", () => { state.activeFolderId = folder.id; renderMemories(); document.querySelector("#recuerdos")?.scrollIntoView({behavior:"smooth"}); });
    elements.foldersGrid.append(card);
  });
}

// ---------- Guardar y editar (solo en memoria del navegador) ----------

function resetForm() {
  elements.memoryForm.reset();
  elements.memoryId.value = "";
  state.selectedFiles = [];
  state.isEditing = false;
  clearFileInputs();
  updateSelectedFiles();
  elements.saveButton.textContent = "Guardar recuerdo";
  elements.cancelEditButton.hidden = true;
  elements.uploadProgressArea.hidden = true;
  elements.uploadProgress.value = 0;
  setMessage(elements.formMessage, "");
}

function validateMemoryForm() {
  const description = elements.description.value.trim();
  const memoryDate = elements.memoryDate.value;
  const editingId = elements.memoryId.value;
  if (state.selectedFiles.length === 0 && !description) {
    setMessage(elements.formMessage, "Agregá al menos un archivo o escribí un recuerdo de texto.", "error");
    elements.description.focus();
    return null;
  }
  return { folderId: elements.memoryFolder.value || "", description, memoryDate, editingId };
}

function createMemoryRecord({ file, folderId, description, memoryDate, existing }) {
  const now = new Date();
  const mediaType = file ? getMediaType(file) : "text";
  let fileUrl = existing?.fileUrl || "";
  if (file) fileUrl = registerObjectUrl(file);
  return {
    id: existing?.id || createId(), file, fileName: file?.name || existing?.fileName || "",
    fileType: file?.type || existing?.fileType || "", mediaType, fileUrl,
    folderId: folderId ?? existing?.folderId ?? "", description, memoryDate: memoryDate || "",
    uploadedAt: existing?.uploadedAt || now.toISOString(), updatedAt: now.toISOString(),
  };
}

async function saveMemory(event) {
  event.preventDefault();
  const formData = validateMemoryForm();
  if (!formData) return;

  const { folderId, description, memoryDate, editingId } = formData;
  const existing = editingId ? state.memories.find((item) => item.id === editingId) : null;

  if (editingId && !existing) {
    setMessage(elements.formMessage, "No encontramos el recuerdo que querés editar. Actualizá la lista e intentá de nuevo.", "error");
    return;
  }

  elements.saveButton.disabled = true;
  elements.uploadProgressArea.hidden = false;
  elements.uploadProgress.value = 10;
  elements.uploadStatus.textContent = "Preparando recuerdo...";

  try {
    if (existing) {
      const replacementFile = state.selectedFiles[0]?.file || null;
      if (replacementFile && existing.fileUrl) revokeObjectUrl(existing.fileUrl);

      const updated = createMemoryRecord({
        file: replacementFile,
        folderId,
        description,
        memoryDate,
        existing: {
          ...existing,
          fileUrl: replacementFile ? "" : existing.fileUrl,
        },
      });

      // Si no se eligió un archivo nuevo, conservar el tipo y la URL originales.
      if (!replacementFile) {
        updated.mediaType = existing.mediaType;
        updated.file = existing.file;
        updated.fileName = existing.fileName;
        updated.fileType = existing.fileType;
        updated.fileUrl = existing.fileUrl;
      }

      state.memories = state.memories.map((item) => item.id === existing.id ? updated : item);
    } else if (state.selectedFiles.length) {
      for (const entry of state.selectedFiles) {
        state.memories.unshift(
          createMemoryRecord({ file: entry.file, folderId, description: entry.description?.trim() || "", memoryDate }),
        );
      }
    } else {
      state.memories.unshift(
        createMemoryRecord({ file: null, folderId, description, memoryDate }),
      );
    }

    elements.uploadProgress.value = 100;
    elements.uploadStatus.textContent = "Recuerdo agregado a la sesión actual.";
    renderFolders();
    refreshFolderOptions();
    renderMemories();
    resetForm();
    setMessage(
      elements.formMessage,
      "Listo. El recuerdo está disponible mientras esta página siga abierta; todavía no se guardó en Drive.",
      "success",
    );
    elements.uploadProgressArea.hidden = true;
    document.querySelector("#recuerdos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("Error al preparar el recuerdo:", error);
    setMessage(elements.formMessage, "No se pudo preparar el recuerdo. Revisá los datos e intentá nuevamente.", "error");
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
  elements.memoryId.value = memory.id;
  elements.description.value = memory.description;
  elements.memoryDate.value = memory.memoryDate;
  elements.memoryFolder.value = memory.folderId || "";

  state.isEditing = true;
  elements.saveButton.textContent = "Guardar cambios";
  elements.cancelEditButton.hidden = false;
  setMessage(
    elements.formMessage,
    "Editando este recuerdo. Si elegís un archivo nuevo, reemplazará el archivo asociado.",
  );

  document.querySelector("#subir")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Filtrar, ordenar y renderizar recuerdos ----------

function matchesFilters(memory) {
  const search = elements.search.value.trim().toLocaleLowerCase("es-AR");
  const category = elements.filterCategory.value;
  const type = elements.filterType.value;

  const matchesSearch = !search ||
    memory.description.toLocaleLowerCase("es-AR").includes(search) ||
    memory.fileName.toLocaleLowerCase("es-AR").includes(search);

  const folder = state.folders.find(item => item.id === memory.folderId);
  const matchesFolder = state.activeFolderId === "all" || (state.activeFolderId === "unorganized" ? !memory.folderId : memory.folderId === state.activeFolderId);
  return matchesSearch && matchesFolder &&
    (!category || folder?.category === category) &&
    (!type || memory.mediaType === type);
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
        return a.description.localeCompare(b.description, "es-AR");
      case "description-desc":
        return b.description.localeCompare(a.description, "es-AR");
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
    const fitScale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight, 1);
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
  elements.photoViewerImage.alt = memory.description || memory.fileName || "Foto ampliada";
  elements.photoViewerImage.onload = () => updatePhotoZoom(1);
  if (elements.photoViewerCaption) elements.photoViewerCaption.textContent = memory.description || memory.fileName || "Foto";
  if (elements.photoViewerStage) elements.photoViewerStage.scrollTop = 0;
  if (typeof elements.photoViewerDialog.showModal === "function") {
    elements.photoViewerDialog.showModal();
    updatePhotoZoom(1);
  }
}

function closePhotoViewer() {
  if (elements.photoViewerDialog?.open) elements.photoViewerDialog.close();
}

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

  if (memory.mediaType === "image" && memory.fileUrl) {
    const image = document.createElement("img");
    image.src = memory.fileUrl;
    image.alt = memory.description || memory.fileName || "Foto de un recuerdo";
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
    const video = document.createElement("video");
    video.src = memory.fileUrl;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    container.append(video);
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
      memory.mediaType === "text" ? "Un recuerdo escrito" : "Archivo",
    );
    container.append(preview);
  }

  return container;
}

function renderMemoryCard(memory) {
  const card = makeElement("article", "memory-card");
  card.append(renderMemoryMedia(memory));

  const body = makeElement("div", "memory-card-body");
  const topline = makeElement("div", "memory-card-topline");
  topline.append(
    makeElement("span", "memory-category", state.folders.find(folder => folder.id === memory.folderId)?.category || "Sin organizar"),
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
    memory.fileName || (memory.description ? "Recuerdo escrito" : "Recuerdo sin título"),
  );
  const description = makeElement("p", "memory-card-description", memory.description || "");
  if (!memory.description) description.hidden = true;

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
  moveSelect.add(new Option("Sin organizar", ""));
  state.folders.forEach(folder => moveSelect.add(new Option(`${folder.title} · ${folder.category}`, folder.id)));
  moveSelect.value = memory.folderId || "";
  moveSelect.addEventListener("change", () => {
    memory.folderId = moveSelect.value;
    memory.updatedAt = new Date().toISOString();
    renderFolders(); renderMemories();
  });
  moveLabel.append(moveSelect);
  actions.append(moveLabel, editButton, deleteButton);
  body.append(topline, title, description, dates, actions);
  card.append(body);

  return card;
}

function renderMemories() {
  if (!elements.memoriesGrid) return;

  elements.memoriesGrid.replaceChildren();
  elements.memoriesLoading.hidden = true;
  elements.memoriesError.hidden = true;

  const filtered = sortMemories(state.memories.filter(matchesFilters));
  const activeFolder = state.folders.find(folder => folder.id === state.activeFolderId);
  const sectionTitle = $("#memories-title");
  if (sectionTitle) sectionTitle.textContent = activeFolder ? activeFolder.title : state.activeFolderId === "unorganized" ? "Sin organizar" : "Nuestros recuerdos";
  renderFolders();
  elements.memoriesCount.textContent =
    `${filtered.length} ${filtered.length === 1 ? "recuerdo" : "recuerdos"}`;

  if (filtered.length === 0) {
    elements.memoriesEmpty.hidden = false;
    return;
  }

  elements.memoriesEmpty.hidden = true;
  const fragment = document.createDocumentFragment();
  filtered.forEach((memory) => fragment.append(renderMemoryCard(memory)));
  elements.memoriesGrid.append(fragment);
}

[
  elements.search,
  elements.filterCategory,
  elements.filterType,
  elements.sort,
].forEach((control) => {
  control?.addEventListener("input", renderMemories);
  control?.addEventListener("change", renderMemories);
});

elements.clearFiltersButton?.addEventListener("click", () => {
  elements.search.value = "";
  elements.filterCategory.value = "";
  elements.filterType.value = "";
  state.activeFolderId = "all";
  elements.sort.value = "uploaded-desc";
  renderMemories();
});

elements.showAllMemoriesButton?.addEventListener("click", () => { state.activeFolderId = "all"; renderMemories(); });
elements.showUnorganizedButton?.addEventListener("click", () => { state.activeFolderId = "unorganized"; renderMemories(); });
elements.retryMemoriesButton?.addEventListener("click", renderMemories);

// ---------- Eliminar recuerdos (confirmación) ----------

function askDeleteMemory(id) {
  state.pendingDeleteId = id;
  if (typeof elements.deleteDialog.showModal === "function") {
    elements.deleteDialog.showModal();
  } else {
    const accepted = window.confirm("¿Querés eliminar este recuerdo de la sesión actual?");
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

function deleteMemory(id) {
  const memory = state.memories.find((item) => item.id === id);
  if (!memory) return;

  revokeObjectUrl(memory.fileUrl);
  state.memories = state.memories.filter((item) => item.id !== id);
  renderFolders();
  renderMemories();
}

// ---------- Navegación de las dos secciones ----------

document.querySelectorAll("[data-section-link]").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll("[data-section-link]").forEach((item) => {
      item.removeAttribute("aria-current");
    });
    link.setAttribute("aria-current", "page");
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
updateFolderCategoryControl();
refreshFolderOptions();
renderFolders();
elements.memoriesLoading.hidden = true;
elements.memoriesEmpty.hidden = true;
elements.memoriesError.hidden = true;
showLogin();
