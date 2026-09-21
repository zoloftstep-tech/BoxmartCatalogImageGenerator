const form = document.getElementById("form");
const fileInput = document.getElementById("file");
const drop = document.getElementById("drop");
const dropText = document.getElementById("dropText");
const previewIn = document.getElementById("previewIn");
const previewOut = document.getElementById("previewOut");
const resultFrame = document.getElementById("resultFrame");
const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run");
const download = document.getElementById("download");
const fileList = document.getElementById("fileList");
const refreshBtn = document.getElementById("refresh");

let objectUrl = null;

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

function showInputPreview(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  previewIn.src = url;
  previewIn.hidden = false;
  dropText.hidden = true;
}

fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) showInputPreview(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
});
["dragleave", "drop"].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  });
});
drop.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  showInputPreview(file);
});

async function loadOutputs() {
  const res = await fetch("/api/outputs");
  const data = await res.json();
  fileList.innerHTML = "";
  if (!data.files?.length) {
    fileList.innerHTML = `<li class="muted">Пока пусто</li>`;
    return;
  }
  for (const name of data.files) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `/api/outputs/${encodeURIComponent(name)}`;
    a.target = "_blank";
    a.textContent = name;
    li.appendChild(a);
    fileList.appendChild(li);
  }
}

refreshBtn.addEventListener("click", () => loadOutputs());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) {
    setStatus("Выберите фото", "err");
    return;
  }

  const body = new FormData();
  body.append("file", file);
  body.append("length", document.getElementById("length").value);
  body.append("width", document.getElementById("width").value);
  body.append("height", document.getElementById("height").value);
  body.append("kind", document.getElementById("kind").value);
  body.append("fefco", document.getElementById("fefco").value);
  body.append("bg", document.getElementById("kind").value === "diecut" && document.getElementById("bg").value.toLowerCase() === "#f5f5f5"
    ? "#ffffff"
    : document.getElementById("bg").value);
  body.append("fmt", document.getElementById("fmt").value);
  body.append("draw_dims", document.getElementById("draw_dims").checked ? "true" : "false");
  body.append("save", "true");
  body.append("canvas", "1600");

  runBtn.disabled = true;
  setStatus("Наношу размеры…");

  try {
    const res = await fetch("/api/process", { method: "POST", body });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    const blob = await res.blob();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    previewOut.src = objectUrl;
    previewOut.hidden = false;
    resultFrame.querySelector(".muted")?.remove();

    const savedAs = res.headers.get("X-Saved-As") || "result.png";
    download.href = objectUrl;
    download.download = savedAs;
    download.hidden = false;
    setStatus(`Сохранено: output/${savedAs}`, "ok");
    await loadOutputs();
  } catch (err) {
    setStatus(err.message || String(err), "err");
  } finally {
    runBtn.disabled = false;
  }
});

loadOutputs();
