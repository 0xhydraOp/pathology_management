const select = document.getElementById('select'), form = document.getElementById('form'), status = document.getElementById('status');
function message(text, error = false) { status.textContent = text; status.className = error ? 'error' : ''; }
select.addEventListener('click', async () => {
  select.disabled = true;
  try {
    const result = await window.administratorRecovery.select();
    if (result.canceled) return;
    document.getElementById('directory').textContent = result.directory;
    document.getElementById('username').replaceChildren(...result.admins.map(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; return option; }));
    form.hidden = false; message('Database validated and exclusively locked for recovery.');
  } catch (error) { form.hidden = true; message(error.message, true); }
  finally { select.disabled = false; }
});
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = document.getElementById('reset'); button.disabled = true; select.disabled = true;
  try {
    const result = await window.administratorRecovery.reset(...['username', 'password', 'repeated', 'confirmation'].map(id => document.getElementById(id).value));
    form.hidden = true; message('Password replaced. Close this window and log in. Verified recovery copy: ' + result.backup);
  } catch (error) { message(error.message, true); button.disabled = false; select.disabled = false; }
  finally { document.getElementById('password').value = ''; document.getElementById('repeated').value = ''; }
});
