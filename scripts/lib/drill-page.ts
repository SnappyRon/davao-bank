/** Inline page for the local Bantay drill console. No external assets or telemetry. */

export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bantay Drill Console</title>
<style>
  :root { color-scheme: light; font-family: system-ui, -apple-system, sans-serif; }
  body { margin: 0; padding: 1.5rem; background: #f4f6f9; color: #16233a; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  h2 { font-size: 1.05rem; margin: 0 0 .6rem; }
  .local { margin: 0 0 1.25rem; color: #53627a; font-size: .9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
  .card { background: #fff; border: 1px solid #d8dfeb; border-radius: 12px; padding: 1rem; box-shadow: 0 1px 2px rgba(20,35,60,.05); }
  fieldset { border: 0; margin: 0; padding: 0; }
  legend { font-weight: 650; margin-bottom: .5rem; }
  label { display: block; margin: .45rem 0; }
  select, button { font: inherit; padding: .45rem .6rem; border: 1px solid #b9c5d8; border-radius: 8px; background: #fff; }
  button { cursor: pointer; margin: .35rem .35rem 0 0; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .controls { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .9rem; }
  #status { display: inline-block; padding: .3rem .75rem; border-radius: 999px; background: #e8edf5; font-weight: 650; }
  #status[data-tone="bad"] { background: #fde8e6; color: #8c1d18; }
  #status[data-tone="warn"] { background: #fff3d6; color: #6b4b00; }
  #status[data-tone="good"] { background: #e4f6ea; color: #14532d; }
  .meta { color: #53627a; font-size: .9rem; }
  ol { list-style: none; margin: 0; padding: 0; max-height: 22rem; overflow-y: auto; }
  li { border-bottom: 1px solid #e7ebf2; padding: .55rem 0; font-size: .9rem; }
  li:last-child { border-bottom: 0; }
  .time { color: #53627a; font-variant-numeric: tabular-nums; margin-right: .4rem; }
  .bantay-row { display: flex; justify-content: space-between; gap: 1rem; padding: .3rem 0; border-bottom: 1px solid #eef1f6; font-size: .9rem; }
  .bantay-row span:last-child { text-align: right; max-width: 60%; overflow-wrap: anywhere; }
  .hint { font-size: .85rem; color: #53627a; margin-top: .8rem; }
</style>
</head>
<body>
<h1>Bantay Drill Console</h1>
<p class="local">Local only — not reachable from the network. Owner-controlled drill; no customer sign-in here.</p>
<div class="grid">
  <section class="card" aria-labelledby="setup-heading">
    <h2 id="setup-heading">Drill setup</h2>
    <fieldset>
      <legend>Target</legend>
      <label for="target">Test account</label>
      <select id="target">
        <option value="test-customer-a@davaobank.ph">test-customer-a@davaobank.ph</option>
        <option value="test-customer-b@davaobank.ph">test-customer-b@davaobank.ph</option>
      </select>
    </fieldset>
    <fieldset style="margin-top:.9rem">
      <legend>Steps</legend>
      <label><input type="checkbox" id="step-1" checked> 1 · Failed password sign-ins</label>
      <label><input type="checkbox" id="step-2" checked> 2 · New-device sign-in</label>
      <label><input type="checkbox" id="step-3" checked> 3 · Wrong TOTP codes</label>
      <label><input type="checkbox" id="step-4" checked> 4 · Large transfer to a new payee</label>
      <label><input type="checkbox" id="step-5" checked> 5 · RLS probes</label>
    </fieldset>
    <label for="intensity" style="margin-top:.9rem">Intensity</label>
    <select id="intensity">
      <option value="standard">Standard</option>
      <option value="minimal">Minimal</option>
    </select>
    <div class="controls">
      <button id="start" type="button">Start</button>
      <button id="pause" type="button">Pause</button>
      <button id="resume" type="button">Resume</button>
      <button id="stop" type="button">Stop</button>
      <button id="reset" type="button">Reset</button>
    </div>
    <p class="hint">Reset unlocks only the selected test account and removes the temporary test factor. No password is accepted by this page.</p>
  </section>
  <section class="card" aria-labelledby="live-heading">
    <h2 id="live-heading">Live status</h2>
    <span id="status" role="status" aria-live="polite">Idle</span>
    <p class="meta" id="meta">Target: — · Requests: 0 of 25</p>
    <label><input type="checkbox" id="observe" checked> Observation on</label>
    <h2 style="margin-top:1rem">Attack timeline</h2>
    <label class="meta"><input type="checkbox" id="autoscroll" checked> Auto-scroll</label>
    <ol id="timeline" aria-label="Attack timeline"></ol>
  </section>
  <section class="card" aria-labelledby="bantay-heading">
    <h2 id="bantay-heading">Bantay response</h2>
    <p class="meta" id="bantay-updated">Waiting for observation…</p>
    <div id="bantay"></div>
  </section>
</div>
<script>
(function () {
  var statusEl = document.getElementById('status');
  var metaEl = document.getElementById('meta');
  var timelineEl = document.getElementById('timeline');
  var bantayEl = document.getElementById('bantay');
  var bantayUpdated = document.getElementById('bantay-updated');
  var targetEl = document.getElementById('target');
  var intensityEl = document.getElementById('intensity');
  var observeEl = document.getElementById('observe');
  var autoscrollEl = document.getElementById('autoscroll');
  var buttons = {
    start: document.getElementById('start'), pause: document.getElementById('pause'),
    resume: document.getElementById('resume'), stop: document.getElementById('stop'),
    reset: document.getElementById('reset')
  };
  var lastRendered = 0;

  function row(label, value) {
    var div = document.createElement('div');
    div.className = 'bantay-row';
    var left = document.createElement('span'); left.textContent = label;
    var right = document.createElement('span'); right.textContent = value == null ? '—' : String(value);
    div.appendChild(left); div.appendChild(right);
    return div;
  }

  function renderTimeline(items) {
    timelineEl.textContent = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var li = document.createElement('li');
      var time = document.createElement('span'); time.className = 'time'; time.textContent = item.at;
      li.appendChild(time);
      li.appendChild(document.createTextNode(item.name + ' — ' + item.status + ' · ' + item.detail));
      if (item.response) {
        var resp = document.createElement('div'); resp.className = 'meta'; resp.textContent = 'Bantay: ' + item.response;
        li.appendChild(resp);
      }
      timelineEl.appendChild(li);
    }
    if (autoscrollEl.checked) timelineEl.scrollTop = timelineEl.scrollHeight;
  }

  function render(snapshot) {
    statusEl.textContent = snapshot.statusLabel;
    var tone = 'good';
    if (snapshot.status === 'frozen') tone = 'bad';
    if (snapshot.status === 'not verified' || snapshot.status === 'stopped') tone = 'bad';
    if (snapshot.status === 'paused' || snapshot.status === 'resetting') tone = 'warn';
    statusEl.setAttribute('data-tone', tone);
    metaEl.textContent = 'Target: ' + snapshot.target + ' · Requests: ' + snapshot.requests + ' of ' + snapshot.maxTotalRequests;
    renderTimeline(snapshot.timeline || []);
    bantayEl.textContent = '';
    var observation = snapshot.observation || {};
    bantayEl.appendChild(row('Lock', observation.locked === true ? 'Locked' : (observation.locked === false ? 'Open' : '—')));
    bantayEl.appendChild(row('Unlock after', observation.unlock_after || '—'));
    bantayEl.appendChild(row('Recent events', (observation.events || []).join(', ') || 'None observed'));
    bantayEl.appendChild(row('Notifications', (observation.notifications || []).join(' | ') || 'None observed'));
    bantayEl.appendChild(row('System cases', (observation.cases || []).join(', ') || 'None observed'));
    bantayUpdated.textContent = observation.updated ? 'Observed ' + observation.updated : 'Waiting for observation…';
    buttons.start.disabled = !snapshot.canStart;
    buttons.pause.disabled = snapshot.status !== 'running';
    buttons.resume.disabled = snapshot.status !== 'paused';
    buttons.stop.disabled = !['running', 'paused', 'frozen'].includes(snapshot.status);
    buttons.reset.disabled = snapshot.status === 'resetting';
    observeEl.checked = snapshot.observe !== false;
    targetEl.value = snapshot.target;
    intensityEl.value = snapshot.intensity;
    for (var i = 1; i <= 5; i++) {
      document.getElementById('step-' + i).checked = (snapshot.steps || []).indexOf(i) !== -1;
    }
  }

  function command(name, extra) {
    var body = { command: name };
    if (name === 'start') {
      body.target = targetEl.value;
      body.intensity = intensityEl.value;
      body.steps = [1,2,3,4,5].filter(function (n) { return document.getElementById('step-' + n).checked; });
      body.observe = observeEl.checked;
    }
    if (extra) Object.keys(extra).forEach(function (key) { body[key] = extra[key]; });
    fetch('/api/command', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (response) { return response.json(); })
      .then(function (result) {
        if (!result.ok) {
          var note = document.createElement('p'); note.className = 'hint'; note.textContent = result.reason || 'Command refused';
          document.body.insertBefore(note, document.body.firstChild);
          window.setTimeout(function () { note.remove(); }, 5000);
        }
      }).catch(function () {});
  }

  Object.keys(buttons).forEach(function (name) {
    buttons[name].addEventListener('click', function () { command(name); });
  });

  var source = new EventSource('/api/events');
  source.addEventListener('snapshot', function (event) {
    var snapshot = JSON.parse(event.data);
    if (snapshot.revision >= lastRendered) { lastRendered = snapshot.revision; render(snapshot); }
  });
  source.onerror = function () { statusEl.textContent = 'Not verified'; statusEl.setAttribute('data-tone', 'bad'); };
})();
</script>
</body>
</html>`;
