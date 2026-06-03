/* ================================================================
   app.js  —  ResumeAI Application Logic
   All JavaScript: state, file upload, analysis, rendering, chat.

   ⚠️  Requires config.js to be loaded BEFORE this file.
       config.js provides: ANTHROPIC_API_KEY
   ================================================================ */
console.log("KEY:", window.ANTHROPIC_API_KEY);
console.log("LENGTH:", window.ANTHROPIC_API_KEY?.length);

/* ── STATE ── */
let appState = {
  resumeText: '',
  jobTitle: '',
  analysisResult: null,
  chatHistory: [],
  activeTab: 'issues',
  fileUploaded: false
};

/* ── FILE UPLOAD ── */
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('dragover',  e => { e.preventDefault(); });
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFileUpload(e.target.files[0]);
});

function handleFileUpload(file) {
  document.getElementById('file-selected-name').innerHTML = `<i class="ti ti-paperclip"></i>${file.name}`;
  dropZone.classList.add('has-file');
  document.getElementById('dz-icon-i').className = 'ti ti-file-check';
  document.getElementById('dz-title').textContent = 'File ready!';
  document.getElementById('dz-sub').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    const ta = document.getElementById('resume-textarea');
    ta.value = e.target.result.substring(0, 8000);
    document.getElementById('char-counter').textContent = ta.value.length + ' chars';
  };
  reader.readAsText(file);
  // Hide paste section, show toggle link
  appState.fileUploaded = true;
  document.getElementById('paste-section').style.display = 'none';
  document.getElementById('paste-toggle-wrap').style.display = 'block';
  document.getElementById('paste-toggle-btn').textContent = '+ Also paste/edit text manually';
}

function togglePasteSection() {
  const section = document.getElementById('paste-section');
  const btn = document.getElementById('paste-toggle-btn');
  const isHidden = section.style.display === 'none';
  section.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? '− Hide text editor' : '+ Also paste/edit text manually';
}

document.getElementById('resume-textarea').addEventListener('input', function() {
  document.getElementById('char-counter').textContent = this.value.length + ' chars';
});

/* ── VIEW MANAGEMENT ── */
function showView(id) {
  ['upload-view','loading-view','results-view'].forEach(v => {
    document.getElementById(v).classList.toggle('hidden', v !== id);
    document.getElementById(v).classList.toggle('active', v === id);
  });
  document.getElementById('bottom-nav').classList.toggle('hidden', id !== 'results-view');
  const body = document.getElementById('screen-body');
  body.style.overflow = (id === 'results-view') ? 'hidden' : 'auto';
  if (id === 'results-view') {
    document.getElementById('results-scroll-area').style.overflow = 'auto';
    document.getElementById('results-scroll-area').style.height = `calc(100dvh - var(--header-height) - var(--nav-height) - var(--safe-bottom))`;
  }
}

/* ── TAB SWITCHING ── */
function switchTab(name) {
  appState.activeTab = name;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === name);
  });

  const isChat = name === 'chat';
  document.getElementById('results-scroll-area').classList.toggle('hidden', isChat);

  ['issues','improvements','ats','keywords','chat'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) {
      el.classList.toggle('active', t === name);
      el.classList.toggle('hidden', t !== name);
    }
  });
}

// ✅ API key is loaded from config.js  →  see config.js to set your key
async function handleFileUpload(file) {

  document.getElementById('file-selected-name').innerHTML =
    `<i class="ti ti-paperclip"></i>${file.name}`;

  dropZone.classList.add('has-file');

  document.getElementById('dz-icon-i').className =
    'ti ti-file-check';

  document.getElementById('dz-title').textContent =
    'File ready!';

  document.getElementById('dz-sub').textContent =
    file.name;

  const textarea =
    document.getElementById('resume-textarea');

  try {

    // PDF
    if (file.type === "application/pdf") {

      const arrayBuffer = await file.arrayBuffer();

      const pdf =
        await pdfjsLib.getDocument({
          data: arrayBuffer
        }).promise;

      let text = "";

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

        const page = await pdf.getPage(pageNum);

        const content =
          await page.getTextContent();

        text += content.items
          .map(item => item.str)
          .join(" ");

        text += "\n";
      }

      textarea.value = text;
    }

    // DOC/DOCX
    else if (
      file.name.endsWith(".doc") ||
      file.name.endsWith(".docx")
    ) {

      textarea.value =
        "DOC/DOCX extraction requires Mammoth.js. Please upload PDF or TXT.";
    }

    // TXT
    else {

      textarea.value = await file.text();
    }

    document.getElementById(
      "char-counter"
    ).textContent =
      textarea.value.length + " chars";

  } catch (err) {

    console.error(err);

    alert(
      "Unable to read this file. Please upload PDF or TXT."
    );
  }

  appState.fileUploaded = true;

  document.getElementById(
    "paste-section"
  ).style.display = "none";

  document.getElementById(
    "paste-toggle-wrap"
  ).style.display = "block";
}
/* ── ANALYSIS ── */
async function startAnalysis() {
  const text = document.getElementById('resume-textarea').value.trim();
  if (!text || text.length < 50) {
    alert('Please upload or paste your resume text first (at least 50 characters).');
    return;
  }
  const jobTitle = document.getElementById('job-title-input').value.trim();
  if (!jobTitle) {
    alert('Please enter your target job title. The analysis is tailored to this role.');
    document.getElementById('job-title-input').focus();
    return;
  }
  appState.resumeText = text;
  appState.jobTitle   = jobTitle;

  document.querySelectorAll('.error-banner').forEach(e => e.remove());
  document.getElementById('analyze-btn').disabled = true;
  showView('loading-view');
  animateLoadingSteps();

  const prompt = `You are an expert resume reviewer and career coach. Analyze the following resume specifically for the role of "${appState.jobTitle}". Evaluate how well this resume positions the candidate for THIS specific role, including relevant keywords, skills, and experience that matter for "${appState.jobTitle}" positions.

Return ONLY valid JSON — no markdown, no prose, no backticks.

Resume:
"""
${appState.resumeText.substring(0, 6000)}
"""

Return exactly this JSON structure:
{
  "score": <number 0-100, score relative to fit for "${appState.jobTitle}">,
  "grade": "<A+|A|B+|B|C+|C|D|F>",
  "verdict": "<2-3 sentence overall assessment specifically for ${appState.jobTitle} role>",
  "sub_scores": {
    "keyword_optimization": <0-100, keywords relevant to ${appState.jobTitle}>,
    "content_quality": <0-100>,
    "formatting_structure": <0-100>,
    "ats_compatibility": <0-100>,
    "impact_metrics": <0-100>
  },
  "critical_issues": [{"title":"...","description":"..."}],
  "warnings": [{"title":"...","description":"..."}],
  "strengths": [{"title":"...","description":"..."}],
  "improvements": [{"title":"...","description":"... (specific advice for ${appState.jobTitle} role)"}],
  "ats": {
    "score": <0-100>,
    "parseable": "<Yes|No|Partial>",
    "format_friendly": "<Yes|No|Partial>",
    "contact_info": "<Complete|Partial|Missing>",
    "checks": [{"title":"...","description":"...","status":"<pass|warn|fail>"}]
  },
  "keywords_found": ["...list of relevant ${appState.jobTitle} keywords found in resume..."],
  "keywords_missing": ["...list of important ${appState.jobTitle} keywords NOT in resume..."]
}`;

  try {

  const resume = appState.resumeText.toLowerCase();
  const role = appState.jobTitle.toLowerCase();

  let score = 50;

  const strengths = [];
  const warnings = [];
  const critical_issues = [];
  const improvements = [];
const keywords = {

  "front-end engineer": [
    "html",
    "css",
    "javascript",
    "typescript",
    "react",
    "next.js",
    "redux",
    "tailwind",
    "git",
    "responsive design"
  ],

  "back-end engineer": [
    "node.js",
    "express",
    "mongodb",
    "sql",
    "postgresql",
    "rest api",
    "authentication",
    "jwt",
    "microservices",
    "docker"
  ],

  "full stack engineer": [
    "html",
    "css",
    "javascript",
    "react",
    "node.js",
    "express",
    "mongodb",
    "sql",
    "api",
    "git"
  ],

  "software engineer in test": [
    "selenium",
    "cypress",
    "automation",
    "testing",
    "test cases",
    "qa",
    "bug tracking",
    "jira",
    "api testing",
    "regression testing"
  ],

  "sdet": [
    "selenium",
    "cypress",
    "playwright",
    "automation",
    "java",
    "python",
    "api testing",
    "test framework",
    "ci/cd",
    "quality assurance"
  ],

  "devops engineer": [
    "docker",
    "kubernetes",
    "aws",
    "azure",
    "linux",
    "terraform",
    "jenkins",
    "ci/cd",
    "monitoring",
    "ansible"
  ],

  "security engineer": [
    "penetration testing",
    "owasp",
    "cybersecurity",
    "siem",
    "vulnerability",
    "network security",
    "incident response",
    "encryption",
    "firewall",
    "risk assessment"
  ],

  "data engineer": [
    "python",
    "sql",
    "etl",
    "spark",
    "hadoop",
    "data warehouse",
    "airflow",
    "aws",
    "big data",
    "data pipeline"
  ],

  "cloud architect": [
    "aws",
    "azure",
    "gcp",
    "cloud security",
    "terraform",
    "kubernetes",
    "microservices",
    "networking",
    "scalability",
    "architecture"
  ],

  "systems engineer": [
    "linux",
    "networking",
    "server management",
    "virtualization",
    "windows server",
    "troubleshooting",
    "automation",
    "security",
    "monitoring",
    "infrastructure"
  ],

  "mobile engineer": [
    "android",
    "ios",
    "flutter",
    "react native",
    "swift",
    "kotlin",
    "mobile development",
    "api integration",
    "firebase",
    "ui/ux"
  ],

  "technical support engineer": [
    "troubleshooting",
    "customer support",
    "ticketing",
    "technical documentation",
    "networking",
    "windows",
    "linux",
    "incident management",
    "problem solving",
    "help desk"
  ],

  "game developer": [
    "unity",
    "unreal engine",
    "c#",
    "c++",
    "game design",
    "3d",
    "animation",
    "physics",
    "multiplayer",
    "optimization"
  ],

  "machine learning engineer": [
    "python",
    "tensorflow",
    "pytorch",
    "machine learning",
    "deep learning",
    "data science",
    "neural networks",
    "feature engineering",
    "nlp",
    "computer vision"
  ],

  "artificial intelligence engineer": [
    "python",
    "llm",
    "ai",
    "machine learning",
    "deep learning",
    "transformers",
    "pytorch",
    "tensorflow",
    "nlp",
    "generative ai"
  ],

  "blockchain engineer": [
    "solidity",
    "ethereum",
    "smart contracts",
    "web3",
    "blockchain",
    "defi",
    "cryptography",
    "token",
    "consensus",
    "wallet"
  ],

  "embedded systems engineer": [
    "c",
    "c++",
    "microcontroller",
    "embedded",
    "firmware",
    "arduino",
    "rtos",
    "hardware",
    "spi",
    "i2c"
  ],

  "web application security engineer": [
    "owasp",
    "penetration testing",
    "burp suite",
    "xss",
    "csrf",
    "sql injection",
    "security testing",
    "authentication",
    "authorization",
    "vulnerability assessment"
  ],

  "site reliability engineer": [
    "linux",
    "docker",
    "kubernetes",
    "monitoring",
    "prometheus",
    "grafana",
    "automation",
    "aws",
    "incident response",
    "scalability"
  ],

  "ux engineer": [
    "figma",
    "wireframes",
    "prototypes",
    "user research",
    "usability testing",
    "interaction design",
    "accessibility",
    "design systems",
    "journey mapping",
    "ux"
  ],

  "ui engineer": [
    "html",
    "css",
    "javascript",
    "figma",
    "responsive design",
    "design systems",
    "tailwind",
    "react",
    "accessibility",
    "ui"
  ],

  "robotics engineer": [
    "robotics",
    "ros",
    "python",
    "c++",
    "automation",
    "computer vision",
    "embedded systems",
    "sensors",
    "control systems",
    "ai"
  ],

  "iot engineer": [
    "iot",
    "mqtt",
    "embedded",
    "sensors",
    "arduino",
    "raspberry pi",
    "cloud",
    "wireless",
    "firmware",
    "automation"
  ],

  "software integration engineer": [
    "api",
    "rest",
    "soap",
    "integration",
    "middleware",
    "microservices",
    "json",
    "xml",
    "database",
    "automation"
  ]
};

  let targetKeywords = [];

  Object.keys(keywords).forEach(key => {
 if (
  role.toLowerCase().includes(key.toLowerCase())
) {
      targetKeywords = keywords[key];
    }
  });

  if (targetKeywords.length === 0) {
    targetKeywords = [
      "communication",
      "leadership",
      "problem solving",
      "teamwork"
    ];
  }

  const found = [];
  const missing = [];

  targetKeywords.forEach(keyword => {
    if (resume.includes(keyword)) {
      found.push(keyword);
      score += 5;
    } else {
      missing.push(keyword);
    }
  });

  if (!resume.includes("experience")) {
    critical_issues.push({
      title: "Experience section missing",
      description: "Add a professional experience section."
    });

    score -= 15;
  }

  if (!resume.includes("skills")) {
    critical_issues.push({
      title: "Skills section missing",
      description: "Add a dedicated skills section."
    });

    score -= 10;
  }

  if (!resume.includes("@")) {
    warnings.push({
      title: "Email not found",
      description: "Recruiters need contact information."
    });

    score -= 10;
  }

  if (found.length >= 3) {
    strengths.push({
      title: "Good keyword coverage",
      description: "Your resume contains important role-specific keywords."
    });
  }

  improvements.push({
    title: "Add measurable achievements",
    description:
      "Include numbers such as percentages, revenue, users, or performance improvements."
  });

  improvements.push({
    title: "Optimize keywords",
    description:
      "Add missing keywords relevant to your target role."
  });

  score = Math.max(0, Math.min(100, score));

  const grade =
    score >= 90 ? "A+" :
    score >= 80 ? "A" :
    score >= 70 ? "B+" :
    score >= 60 ? "B" :
    score >= 50 ? "C+" :
    score >= 40 ? "C" :
    score >= 30 ? "D" : "F";

  appState.analysisResult = {

    score,

    grade,

    verdict:
      score >= 75
        ? "Strong resume with good ATS compatibility."
        : "Resume needs improvements for better ATS performance.",

    sub_scores: {
      keyword_optimization: Math.min(found.length * 15, 100),
      content_quality: score,
      formatting_structure: 80,
      ats_compatibility: score,
      impact_metrics: 60
    },

    critical_issues,

    warnings,

    strengths,

    improvements,

    ats: {
      score,
      parseable: "Yes",
      format_friendly: "Yes",
      contact_info: resume.includes("@")
        ? "Complete"
        : "Partial",

      checks: [
        {
          title: "Resume Parsed",
          description: "Text extraction successful.",
          status: "pass"
        }
      ]
    },

    keywords_found: found,

    keywords_missing: missing
  };

  renderResults(appState.analysisResult);

  showView('results-view');

  switchTab('issues');

}
catch(err) {

  showView('upload-view');

  showErrorBanner(
    'Analysis failed: ' + err.message
  );
}
  document.getElementById('analyze-btn').disabled = false;
}

/* ── LOADING STEPS ANIMATION ── */
function animateLoadingSteps() {
  const delays = [0, 2500, 5500, 9000, 12500];
  delays.forEach((delay, i) => {
    setTimeout(() => {
      const el = document.getElementById('lstep-' + (i + 1));
      if (el) {
        for (let j = 1; j <= i; j++) {
          const prev = document.getElementById('lstep-' + j);
          if (prev) { prev.classList.remove('active'); prev.classList.add('done'); prev.querySelector('.step-dot').innerHTML = '<i class="ti ti-check" style="font-size:10px"></i>'; }
        }
        el.classList.add('active');
      }
    }, delay);
  });
}

/* ── RENDER RESULTS ── */
function renderResults(d) {
  const score = d.score || 0;
  const col = score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--amber)' : 'var(--red)';

  // Show job title badge
  const jtd = document.getElementById('job-title-display');
  if (appState.jobTitle) {
    jtd.textContent = '↳ for ' + appState.jobTitle;
    jtd.style.display = 'block';
  }

  // Ring animation (r=40, circumference ~251.2)
  const el = document.getElementById('ring-fill');
  el.style.stroke = col;
  setTimeout(() => {
    el.style.strokeDashoffset = 251.2 - (251.2 * score / 100);
  }, 200);

  // Animate count
  let n = 0;
  const disp = document.getElementById('score-display');
  disp.style.color = col;
  const iv = setInterval(() => {
    n = Math.min(n + 2, score);
    disp.textContent = n;
    if (n >= score) clearInterval(iv);
  }, 30);

  document.getElementById('grade-label').textContent = d.grade || '—';
  document.getElementById('grade-label').style.color = col;
  document.getElementById('verdict-text').textContent = d.verdict || '';

  renderSubScores(d.sub_scores || {});
  renderIssues(d);
  renderImprovements(d);
  renderATS(d);
  renderKeywords(d);
}

function renderSubScores(ss) {
  const defs = [
    { key:'keyword_optimization',  label:'Keywords' },
    { key:'content_quality',       label:'Content' },
    { key:'formatting_structure',  label:'Formatting' },
    { key:'ats_compatibility',     label:'ATS' },
    { key:'impact_metrics',        label:'Impact' }
  ];
  const grid = document.getElementById('sub-scores-grid');
  grid.innerHTML = '';
  defs.slice(0,4).forEach(({ key, label }) => {
    const val = ss[key] || 0;
    const c = val >= 70 ? 'var(--green)' : val >= 45 ? 'var(--amber)' : 'var(--red)';
    const el = document.createElement('div');
    el.className = 'sub-bar-item';
    el.innerHTML = `
      <div class="sub-bar-row"><span>${label}</span><span class="sub-bar-val" style="color:${c}">${val}</span></div>
      <div class="bar-track"><div class="bar-fill" style="background:${c}" data-w="${val}%"></div></div>`;
    grid.appendChild(el);
  });
  setTimeout(() => grid.querySelectorAll('.bar-fill').forEach(el => { el.style.width = el.dataset.w; }), 300);
}

function buildIssueItem(item, type) {
  const map = {
    critical: { cls:'critical', icls:'ii-red',    icon:'ti-alert-circle' },
    warning:  { cls:'warning',  icls:'ii-amber',   icon:'ti-alert-triangle' },
    strength: { cls:'good',     icls:'ii-green',   icon:'ti-check' },
    improvement:{ cls:'good',   icls:'ii-purple',  icon:'ti-bulb' }
  };
  const cfg = map[type] || map.strength;
  return `<div class="issue-item ${cfg.cls}">
    <div class="issue-icon ${cfg.icls}"><i class="ti ${cfg.icon}"></i></div>
    <div class="issue-body">
      <h4>${esc(item.title || item.name || '')}</h4>
      <p>${esc(item.description || item.desc || '')}</p>
    </div>
  </div>`;
}

function renderIssues(d) {
  document.getElementById('critical-list').innerHTML = (d.critical_issues||[]).length
    ? (d.critical_issues||[]).map(i => buildIssueItem(i,'critical')).join('')
    : '<p class="empty-msg"><i class="ti ti-circle-check" style="color:var(--green)"></i> No critical issues — great start!</p>';
  document.getElementById('warnings-list').innerHTML = (d.warnings||[]).length
    ? (d.warnings||[]).map(i => buildIssueItem(i,'warning')).join('')
    : '<p class="empty-msg">No warnings!</p>';
  document.getElementById('strengths-list').innerHTML = (d.strengths||[]).length
    ? (d.strengths||[]).map(i => buildIssueItem(i,'strength')).join('')
    : '<p class="empty-msg">Keep working — strengths will show here.</p>';
}

function renderImprovements(d) {
  document.getElementById('improvements-list').innerHTML = (d.improvements||[]).map((item, i) => `
    <div class="tip-item">
      <div class="tip-num">Tip ${i+1}</div>
      <h4>${esc(item.title||'')}</h4>
      <p>${esc(item.description||item.desc||'')}</p>
    </div>`).join('') || '<p class="empty-msg">No improvement suggestions generated.</p>';
}

function renderATS(d) {
  const ats = d.ats || {};
  const sc = ats.score || 0;
  const c = sc >= 70 ? 'var(--green)' : sc >= 45 ? 'var(--amber)' : 'var(--red)';
  document.getElementById('ats-summary-grid').innerHTML = `
    <div class="ats-metric"><div class="ats-metric-label">ATS Score</div><div class="ats-metric-value" style="color:${c}">${sc}/100</div></div>
    <div class="ats-metric"><div class="ats-metric-label">Parseable</div><div class="ats-metric-value">${ats.parseable||'—'}</div></div>
    <div class="ats-metric"><div class="ats-metric-label">Format Friendly</div><div class="ats-metric-value">${ats.format_friendly||'—'}</div></div>
    <div class="ats-metric"><div class="ats-metric-label">Contact Info</div><div class="ats-metric-value">${ats.contact_info||'—'}</div></div>`;
  document.getElementById('ats-checks-list').innerHTML = (ats.checks||[]).map(c => {
    const t = c.status==='pass' ? 'strength' : c.status==='warn' ? 'warning' : 'critical';
    return buildIssueItem({title:c.title,description:c.description},t);
  }).join('') || '<p class="empty-msg">No ATS checks generated.</p>';
}

function renderKeywords(d) {
  document.getElementById('keywords-found-wrap').innerHTML = (d.keywords_found||[]).map(k =>
    `<span class="chip chip-found"><i class="ti ti-check" style="font-size:10px"></i>${esc(k)}</span>`
  ).join('') || '<p class="empty-msg">No keywords detected.</p>';
  document.getElementById('keywords-missing-wrap').innerHTML = (d.keywords_missing||[]).map(k =>
    `<span class="chip chip-missing"><i class="ti ti-plus" style="font-size:10px"></i>${esc(k)}</span>`
  ).join('') || '<p class="empty-msg" style="color:var(--green)"><i class="ti ti-check"></i> Excellent keyword coverage!</p>';
}

/* ── CHAT ── */
function sendQuick(msg) {
  document.getElementById('chat-text-input').value = msg;
  sendChatMessage();
}
async function sendChatMessage() {

  const inputEl = document.getElementById('chat-text-input');
  const message = inputEl.value.trim();

  if (!message) return;

  inputEl.value = '';

  addBubble(message, 'user', document.getElementById('chat-msgs'));

  let reply =
    "Based on your resume analysis, focus on adding relevant keywords, measurable achievements, and ATS-friendly formatting.";

  addBubble(reply, 'ai', document.getElementById('chat-msgs'));
}
  appState.chatHistory.push({ role:'user', content:message });

  const typing = document.createElement('div');
  typing.className = 'bubble bubble-ai bubble-typing';
  typing.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  msgsArea.appendChild(typing);
  msgsArea.scrollTop = msgsArea.scrollHeight;

  try {
    const d = appState.analysisResult;
    const sys = `You are a helpful, concise resume coach. The user is targeting the role of: ${appState.jobTitle || 'unspecified'}.
Resume analysis results:
Score: ${d.score}/100 (${d.grade}). Assessment: ${d.verdict}
Critical: ${(d.critical_issues||[]).map(i=>i.title).join(', ')||'None'}
Warnings: ${(d.warnings||[]).map(i=>i.title).join(', ')||'None'}
Strengths: ${(d.strengths||[]).map(i=>i.title).join(', ')||'None'}
ATS score: ${(d.ats||{}).score||'N/A'}/100. Missing keywords: ${(d.keywords_missing||[]).join(', ')||'None'}
Reply helpfully and concisely with advice specific to the ${appState.jobTitle || 'target'} role. Keep under 150 words. Be direct and actionable.`;

   const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
 headers: {
  "Authorization": `Bearer ${ANTHROPIC_API_KEY}`,
  "Content-Type": "application/json"
},
    body: JSON.stringify({
  model: 'anthropic/claude-sonnet-4',
  max_tokens: 1000,
  messages: [
    {
      role: 'system',
      content: sys
    },
    ...appState.chatHistory
  ]
})
    });
  const data = await res.json();

const reply =
  data?.choices?.[0]?.message?.content ||
  'No response received.';
    appState.chatHistory.push({ role:'assistant', content:reply });
    typing.remove();
    addBubble(reply, 'ai', msgsArea);
  } catch (err) {
    typing.remove();
    addBubble('Sorry, an error occurred. Please try again.', 'ai', msgsArea);
  }
  document.getElementById('chat-send-btn').disabled = false;
  inputEl.focus();
}

function addBubble(text, role, container) {
  const el = document.createElement('div');
  el.className = `bubble bubble-${role}`;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

/* ── RESET ── */
function showErrorBanner(msg) {
  // Remove existing
  document.querySelectorAll('.error-banner').forEach(e => e.remove());
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.innerHTML = `<i class="ti ti-alert-circle"></i><span>${msg}</span><button onclick="this.parentElement.remove()"><i class="ti ti-x"></i></button>`;
  // Insert at top of upload view content
  const uploadView = document.getElementById('upload-view');
  uploadView.insertBefore(banner, uploadView.firstChild);
  uploadView.scrollIntoView({ behavior: 'smooth' });
}

function resetToUpload() {
  appState = { resumeText:'', jobTitle:'', analysisResult:null, chatHistory:[], activeTab:'issues', fileUploaded:false };
  document.getElementById('resume-textarea').value = '';
  document.getElementById('char-counter').textContent = '0 chars';
  document.getElementById('job-title-input').value = '';
  document.getElementById('job-title-display').style.display = 'none';
  document.getElementById('file-selected-name').innerHTML = '';
  // Restore paste section visibility
  document.getElementById('paste-section').style.display = 'block';
  document.getElementById('paste-toggle-wrap').style.display = 'none';
  document.getElementById('file-input').value = '';
  dropZone.classList.remove('has-file');
  document.getElementById('dz-icon-i').className = 'ti ti-file-upload';
  document.getElementById('dz-title').textContent = 'Tap to upload resume';
  document.getElementById('dz-sub').textContent = 'or drag & drop your file here';
  document.getElementById('chat-msgs').innerHTML = `
    <div class="chat-empty" id="chat-empty">
      <i class="ti ti-message-dots"></i>
      Ask me anything about your resume.<br>I have full context of your analysis.
      <div class="quick-btns">
        <div class="q-btn" onclick="sendQuick('How can I improve my summary section?')">Improve summary</div>
        <div class="q-btn" onclick="sendQuick('What skills should I add?')">Skills to add</div>
        <div class="q-btn" onclick="sendQuick('How to make it more ATS-friendly?')">ATS tips</div>
        <div class="q-btn" onclick="sendQuick('What are my biggest weaknesses?')">Weaknesses</div>
      </div>
    </div>`;
  document.getElementById('analyze-btn').disabled = false;
  // Reset loading steps
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('lstep-' + i);
    if (el) { el.classList.remove('active','done'); }
  }
  showView('upload-view');
}

/* ── HELPERS ── */
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
