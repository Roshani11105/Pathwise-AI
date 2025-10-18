const form = document.getElementById('studentForm');
const out = document.getElementById('guidance');

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	out.textContent = 'Generating guidance...';
	const data = Object.fromEntries(new FormData(form).entries());
	const payload = {
		name: data.name,
		standard: data.standard,
		hobbies: (data.hobbies || '').split(',').map(s => s.trim()).filter(Boolean),
		skills: (data.skills || '').split(',').map(s => s.trim()).filter(Boolean),
		careerInterest: (data.careerInterest || '').trim()
	};
	try {
		const res = await fetch('/api/student-guidance', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const json = await res.json();
		console.log('student-guidance response:', json);
		if (!res.ok) throw new Error(json.error || 'Error');
		out.textContent = json.guidance || JSON.stringify(json, null, 2) || 'No guidance returned.';
	} catch (err) {
		out.textContent = 'Failed: ' + err.message;
	}
});