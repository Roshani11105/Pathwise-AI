import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// ----- Catalog -----
const CAREER_CATALOG = [
  { id: 'doctor', title: 'Doctor', keywords: ['biology','chemistry','care','medicine','first aid','anatomy','health'], universities: ['AIIMS Delhi', 'CMC Vellore', 'JIPMER'] },
  { id: 'engineer', title: 'Engineer', keywords: ['math','physics','coding','programming','robotics','arduino','circuits','mechanics','algorithms'], universities: ['IIT Bombay', 'IIT Delhi', 'IISc Bengaluru'] },
  { id: 'data-science', title: 'Data Scientist', keywords: ['python','statistics','ml','machine learning','data','excel','sql','pandas'], universities: ['IISc Bengaluru', 'IIT Madras', 'ISB (PGP-DS)'] },
  { id: 'software', title: 'Software Developer', keywords: ['javascript','react','web','apps','coding','java','c++','git','api'], universities: ['IIT Kanpur', 'IIIT Hyderabad', 'BITS Pilani'] },
  { id: 'singer', title: 'Singer', keywords: ['singing','vocal','music','raga','concert','choir'], universities: ['KM Music Conservatory', 'FTII (sound/music)', 'Berklee (intl)'] },
  { id: 'dancer', title: 'Dancer', keywords: ['dance','choreography','ballet','hip hop','bharatanatyam','kathak'], universities: ['NIDM', 'Terence Lewis Academy', 'Kalakshetra'] },
  { id: 'designer', title: 'Product/UX Designer', keywords: ['design','ui','ux','figma','sketch','illustration','typography'], universities: ['NID Ahmedabad', 'IIT Bombay (IDC)', 'National Institute of Design'] },
  { id: 'writer', title: 'Writer/Content Strategist', keywords: ['writing','blog','story','copy','content','journal'], universities: ['Ashoka University', 'JNU', 'FTII (screenwriting)'] },
  { id: 'entrepreneur', title: 'Entrepreneur', keywords: ['startup','business','marketing','sales','pitch','finance','product'], universities: ['IIM Ahmedabad', 'ISB Hyderabad', 'IIT Madras (ED Cell)'] },
  { id: 'researcher', title: 'Research Scientist', keywords: ['lab','research','papers','experiments','theory','math','science'], universities: ['IISc Bengaluru', 'TIFR', 'IIT Bombay'] },
  { id: 'teacher', title: 'Teacher/Educator', keywords: ['teaching','mentoring','tutoring','education','training'], universities: ['TISS', 'Azim Premji University', 'Delhi University'] },
  { id: 'finance', title: 'Finance/Analyst', keywords: ['finance','markets','stocks','excel','valuation','accounting'], universities: ['IIM Calcutta', 'SRCC', 'NSE Academy'] },
  { id: 'law', title: 'Lawyer', keywords: ['law','debate','moot','constitution','civics'], universities: ['NLSIU Bengaluru', 'NLU Delhi', 'NLU Jodhpur'] },
  { id: 'sports', title: 'Athlete/Sports Professional', keywords: ['sports','football','cricket','athletics','fitness','coach'], universities: ['NIS Patiala', 'LNIPE', 'Tata Sports Academy'] },
  { id: 'painter', title: 'Painter/Illustrator', keywords: ['drawing','painting','sketch','art','illustration','visual','canvas','watercolor','digital art'], universities: ['Sir JJ School of Art', 'NID Ahmedabad', 'Srishti Institute'] },
  { id: 'ias', title: 'IAS Officer', keywords: ['ias','civil services','upsc','administration','policy'], universities: ['DU', 'JNU', 'IITs (foundation)'] }
];

// ----- Student endpoint -----
app.post('/api/student-guidance', async (req, res) => {
  const {
    standard,
    hobbies = [],
    skills = [],
    name = 'Student',
    careerInterest = ''
  } = req.body || {};

  try {
    const result = await buildPersonalizedGuidance({
      name,
      standard,
      hobbies,
      skills,
      careerInterest
    });

    if (!result || !result.guidance) {
      return res.json({ guidance: 'No guidance generated. Please check inputs.' });
    }
    return res.json(result);
  } catch (e) {
    console.error('student-guidance error:', e);
    return res.status(500).json({ error: 'Failed to generate guidance' });
  }
});

// ----- Graduate endpoint -----
app.post('/api/regenerate-resume', upload.single('resume'), async (req, res) => {
  try {
    const uploadedPath = req.file?.path;
    let resumeText = '';
    
    console.log('Uploaded file:', req.file);
    
    if (uploadedPath) {
      try {
        // Try to read as text first
        resumeText = fs.readFileSync(uploadedPath, 'utf8');
        console.log('File content length:', resumeText.length);
        console.log('File content preview:', resumeText.substring(0, 200));
      } catch (error) {
        console.log('Error reading file:', error.message);
        resumeText = '';
      }
    }
    
    const name = req.body?.name || 'Candidate';
    console.log('Processing resume for:', name);
    console.log('Resume text:', resumeText || 'No content extracted');
    
    const regeneratedResume = await regenerateResume({ name, resumeText });
    
    res.json({ resume: regeneratedResume });
  } catch (e) {
    console.error('regenerate-resume error:', e);
    res.status(500).json({ error: 'Failed to regenerate resume' });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Pathwise AI server running on http://localhost:${port}`);
});

// ----- Guidance logic -----
const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

function rankCareersByInterestSkillsHobbies(hobbies, skills, careerInterest) {
  const skillsTokens = skills.map(s => s.toLowerCase().trim()).filter(Boolean);
  const hobbyTokens = hobbies.map(s => s.toLowerCase().trim()).filter(Boolean);
  const interestToken = (careerInterest || '').toLowerCase().trim();

  function computeMatches(c) {
    let skillMatches = 0;
    let hobbyMatches = 0;
    for (const kw of c.keywords) {
      if (skillsTokens.some(t => t.includes(kw))) skillMatches += 1;
      if (hobbyTokens.some(t => t.includes(kw))) hobbyMatches += 1;
    }
    const interestMatch =
      interestToken &&
      (c.title.toLowerCase().includes(interestToken) || c.id.includes(interestToken));
    return { c, skillMatches, hobbyMatches, interestMatch: Boolean(interestMatch) };
  }

  const scored = CAREER_CATALOG.map(computeMatches);

  const interestFirst = scored
    .filter(s => s.interestMatch)
    .sort((a, b) => (b.skillMatches - a.skillMatches) || (b.hobbyMatches - a.hobbyMatches))
    .map(s => s.c);

  const skillsThen = scored
    .filter(s => !s.interestMatch && s.skillMatches > 0)
    .sort((a, b) => (b.skillMatches - a.skillMatches) || (b.hobbyMatches - a.hobbyMatches))
    .map(s => s.c);

  const hobbiesThen = scored
    .filter(s => !s.interestMatch && s.skillMatches === 0 && s.hobbyMatches > 0)
    .sort((a, b) => b.hobbyMatches - a.hobbyMatches)
    .map(s => s.c);

  const seen = new Set();
  const ordered = [...interestFirst, ...skillsThen, ...hobbiesThen].filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return { ordered, interestFirst, skillsThen, hobbiesThen };
}

function stepsForCareer(id, standard) {
  const map = {
    doctor: [
      'Prepare for NEET with a structured plan',
      'Shadow a doctor or volunteer at a clinic',
      'Strengthen Biology and Chemistry fundamentals'
    ],
    engineer: [
      'Master Math and Physics',
      'Build a hardware or software project',
      'Solve 50+ problems on a coding platform'
    ],
    'data-science': [
      'Finish Python + Statistics + SQL basics',
      'Build 2 data projects with public datasets',
      'Learn a visualization tool (Tableau/Power BI)'
    ],
    software: [
      'Learn JavaScript + a framework (React/Vue)',
      'Build and deploy 2 apps',
      'Contribute to an open-source repository'
    ],
    singer: [
      'Daily vocal practice (riyaz)',
      'Record and publish 3 covers',
      'Take coaching from a trained vocalist'
    ],
    dancer: [
      'Enroll in a professional dance course',
      'Choreograph and post 3 routines',
      'Audition for local events'
    ],
    designer: [
      'Study UX fundamentals and design systems',
      'Redesign 2 apps/sites in Figma',
      'Create a portfolio and seek critiques'
    ],
    writer: [
      'Write 300–500 words daily',
      'Publish weekly on Medium/Substack',
      'Study copywriting frameworks (AIDA, PAS)'
    ],
    entrepreneur: [
      'Identify a real problem; interview 10 users',
      'Build an MVP (no-code or simple code)',
      'Launch, get feedback, iterate'
    ],
    researcher: [
      'Pick a niche and read 5 survey papers',
      'Replicate one paper experiment',
      'Reach out to a lab for internship'
    ],
    teacher: [
      'Tutor a few students and gather feedback',
      'Create simple lesson plans/materials',
      'Earn a relevant certification if needed'
    ],
    finance: [
      'Learn accounting, valuation, Excel modeling',
      'Analyze 3 companies and write reports',
      'Get micro-certificates (Bloomberg/CFI)'
    ],
    law: [
      'Read case law and write briefs',
      'Join moot court/debate societies',
      'Intern with a legal clinic/firm'
    ],
    sports: [
      'Set a training + nutrition plan',
      'Join a club/coach for practice',
      'Compete in local tournaments'
    ],
    painter: [
      'Complete one sketch/painting per day',
      'Create a Behance/Dribbble portfolio (10 strong pieces)',
      'Learn Procreate/Photoshop/Illustrator; publish 3 case studies'
    ],
    ias: [
      'Understand UPSC syllabus and pattern',
      'Start NCERT basics + daily current affairs',
      'Pick optional subject and plan prelims/mains schedule'
    ]
  };
  return map[id] || [
    'Complete a foundational course (Coursera/edX)',
    'Build a small portfolio project',
    'Find a mentor or community for feedback'
  ];
}

async function buildPersonalizedGuidance({ name, standard, hobbies, skills, careerInterest }) {
  const { ordered, interestFirst, skillsThen, hobbiesThen } =
    rankCareersByInterestSkillsHobbies(hobbies, skills, careerInterest);

  const pick = (arr, n) => arr.slice(0, n);
  const goalCareer = pick(interestFirst, 1)[0] || null;
  const goalSkill = pick(skillsThen, 1)[0] || null;
  const skillHobby = pick(hobbiesThen, 1)[0] || null;

  // Fallbacks without duplicates
  const fillQueue = ordered.filter(c =>
    (!goalCareer || c.id !== goalCareer.id) &&
    (!goalSkill || c.id !== goalSkill.id) &&
    (!skillHobby || c.id !== skillHobby.id)
  );
  const p1 = goalCareer || fillQueue.shift() || CAREER_CATALOG[0];
  const p2 = goalSkill || fillQueue.shift() || CAREER_CATALOG[1] || p1;
  const p3 = skillHobby || fillQueue.shift() || CAREER_CATALOG[2] || p2;

  // First step for each priority
  const step1 = (stepsForCareer(p1.id, standard)[0]) || 'Start with a foundational course';
  const step2 = (stepsForCareer(p2.id, standard)[0]) || 'Build a small portfolio project';
  const step3 = (stepsForCareer(p3.id, standard)[0]) || 'Join a community and get feedback';

  // Top university per priority
  const univ1 = (p1.universities && p1.universities[0]) || '';
  const univ2 = (p2.universities && p2.universities[0]) || '';
  const univ3 = (p3.universities && p3.universities[0]) || '';

  // Visible output (titles/steps/universities only)
  const lines = [];
  lines.push('You can become:');
  lines.push(`1. ${p1.title}`);
  lines.push(`2. ${p2.title}`);
  lines.push(`3. ${p3.title}`);
  lines.push('');
  lines.push('Next steps:');
  lines.push(`1. ${step1}`);
  lines.push(`2. ${step2}`);
  lines.push(`3. ${step3}`);
  lines.push('');
  lines.push('Universities:');
  lines.push(`1. ${univ1 || '—'}`);
  lines.push(`2. ${univ2 || '—'}`);
  lines.push(`3. ${univ3 || '—'}`);

  const guidance = lines.join('\n');

  return {
    guidance,
    priorities: [
      { title: p1.title, reason: 'goal' },
      { title: p2.title, reason: 'goal + skills' },
      { title: p3.title, reason: 'skills + hobbies' }
    ],
    steps: { goal: [step1], goalAndSkills: [step2], skillsAndHobbies: [step3] },
    universities: {
      goal: univ1 ? [univ1] : [],
      goalAndSkills: univ2 ? [univ2] : [],
      skillsAndHobbies: univ3 ? [univ3] : []
    }
  };
}

// ----- Resume logic -----
// ----- Resume logic -----
async function regenerateResume({ name, resumeText }) {
    console.log('Regenerating resume for:', name);
    console.log('Original resume text:', resumeText || 'No content provided');
    
    if (!openai) {
      console.log('No OpenAI key, using fallback analysis');
      return analyzeAndImproveResume(name, resumeText);
    }
    
    // First, analyze the uploaded resume
    const analysisPrompt = `You are a professional resume reviewer. Analyze the following resume and provide:
  
  1. What's good about this resume
  2. What needs improvement (be specific)
  3. Missing elements
  4. Suggestions for better formatting/content
  
  Resume Content:
  ${resumeText || 'No resume content provided'}
  
  Provide a detailed analysis in this format:
  ANALYSIS:
  [Your analysis here]
  
  IMPROVEMENTS NEEDED:
  [Specific improvements here]
  
  MISSING ELEMENTS:
  [What's missing here]`;
  
    try {
      console.log('Analyzing resume...');
      const analysisResp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional resume reviewer. Provide detailed, specific feedback.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.3,
        max_tokens: 800
      });
      
      const analysis = analysisResp.choices?.[0]?.message?.content?.trim();
      
      // Now generate the improved resume
      const improvementPrompt = `Based on the analysis below, rewrite the original resume into a world-class, ATS-friendly resume.
  
  ANALYSIS:
  ${analysis}
  
  ORIGINAL RESUME:
  ${resumeText || 'No resume content provided'}
  
  REQUIREMENTS:
  - Use the candidate's actual name: ${name}
  - Keep all real information from the original resume
  - Improve formatting, add quantifiable achievements
  - Use strong action verbs
  - Make it ATS-friendly
  - Add missing professional elements
  - Keep it concise but impactful
  
  Return only the improved resume text.`;
  
      console.log('Generating improved resume...');
      const resumeResp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional resume writer. Return only the improved resume text.' },
          { role: 'user', content: improvementPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1200
      });
      
      const improvedResume = resumeResp.choices?.[0]?.message?.content?.trim();
      
      // Combine analysis and improved resume
      const result = `RESUME ANALYSIS & IMPROVEMENTS:
  
  ${analysis}
  
  IMPROVED RESUME:
  ${improvedResume}`;
      
      console.log('Analysis and improvement completed');
      return result;
      
    } catch (error) {
      console.error('OpenAI error:', error.message);
      return analyzeAndImproveResume(name, resumeText);
    }
  }
  
  function analyzeAndImproveResume(name, resumeText) {
    // Fallback analysis when no OpenAI
    const hasContent = resumeText && resumeText.trim().length > 50;
    
    if (!hasContent) {
      return `RESUME ANALYSIS & IMPROVEMENTS:
  
  ANALYSIS:
  No resume content was uploaded or extracted. Please upload a valid resume file.
  
  IMPROVEMENTS NEEDED:
  - Upload a resume file (PDF, DOC, or TXT format)
  - Ensure the file contains readable text
  - Try uploading a different file format
  
  MISSING ELEMENTS:
  - Complete resume content
  - Professional experience details
  - Skills and qualifications
  - Education information
  
  IMPROVED RESUME:
  ${name}
  
  SUMMARY
  [Upload a resume to get personalized improvements]
  
  SKILLS
  [To be filled based on uploaded resume]
  
  EXPERIENCE
  [To be filled based on uploaded resume]
  
  EDUCATION
  [To be filled based on uploaded resume]`;
    }
    
    // Basic analysis of uploaded content
    const lines = resumeText.split('\n').filter(line => line.trim());
    const hasSummary = lines.some(line => line.toLowerCase().includes('summary') || line.toLowerCase().includes('objective'));
    const hasSkills = lines.some(line => line.toLowerCase().includes('skill'));
    const hasExperience = lines.some(line => line.toLowerCase().includes('experience') || line.toLowerCase().includes('work'));
    const hasEducation = lines.some(line => line.toLowerCase().includes('education') || line.toLowerCase().includes('degree'));
    
    return `RESUME ANALYSIS & IMPROVEMENTS:
  
  ANALYSIS:
  Your uploaded resume contains ${lines.length} lines of content. Here's what I found:
  
  IMPROVEMENTS NEEDED:
  ${!hasSummary ? '- Add a professional summary/objective section\n' : ''}${!hasSkills ? '- Include a dedicated skills section\n' : ''}${!hasExperience ? '- Add detailed work experience with achievements\n' : ''}${!hasEducation ? '- Include education details\n' : ''}- Use bullet points for better readability
  - Add quantifiable achievements (numbers, percentages)
  - Use strong action verbs (led, implemented, achieved, etc.)
  - Keep formatting consistent
  
  MISSING ELEMENTS:
  ${!hasSummary ? '- Professional summary\n' : ''}${!hasSkills ? '- Skills section\n' : ''}${!hasExperience ? '- Work experience details\n' : ''}${!hasEducation ? '- Education information\n' : ''}- Contact information
  - Certifications (if any)
  
  IMPROVED RESUME:
  ${name}
  
  SUMMARY
  Professional with strong skills and experience. [Upload resume with OpenAI key for detailed analysis]
  
  SKILLS
  [Based on uploaded content - add specific technical and soft skills]
  
  EXPERIENCE
  [Format work experience with achievements and metrics]
  
  EDUCATION
  [Include degree, institution, and graduation year]
  
  NOTE: For detailed analysis and personalized improvements, please configure OpenAI API key.`;
  }

function generateResumeText(name) {
  return `${name}

SUMMARY
Results-driven professional with strong problem-solving and communication skills. Passionate about learning and delivering business impact.

SKILLS
- Programming: JavaScript, HTML, CSS
- Tools: Git, VS Code
- Soft Skills: Collaboration, Ownership, Adaptability

EXPERIENCE
Company — Role (YYYY–YYYY)
- Delivered X by doing Y, resulting in Z% improvement.
- Collaborated with N stakeholders to launch Feature A.

PROJECTS
Project Name
- Built using Tech1, Tech2. Showcased outcome and measurable impact.

EDUCATION
Degree, Institution (Year)

CERTIFICATIONS
Relevant Certification — Issuer (Year)`;
}