const form = document.getElementById('resumeForm');
const out = document.getElementById('resumeOut');
const downloadBtn = document.getElementById('downloadBtn');

let lastResumeText = '';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  out.textContent = 'Regenerating resume...';
  downloadBtn.style.display = 'none';
  const fd = new FormData(form);
  try {
    const res = await fetch('/api/regenerate-resume', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error');
    lastResumeText = json.resume || '';
    out.textContent = lastResumeText;
    downloadBtn.style.display = lastResumeText ? 'inline-block' : 'none';
  } catch (err) {
    out.textContent = 'Failed: ' + err.message;
  }
});

downloadBtn.addEventListener('click', () => {
  const blob = new Blob([lastResumeText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'PathwiseAI_Resume.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});