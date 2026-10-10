// 翻译所有剩余英文内容：学科、领域、类型、掌握标准、评估提示
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DOUBAO_API_KEY;
const ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

const topicsPath = path.join(__dirname, 'data', 'topics.zh.json');
const progressPath = path.join(__dirname, 'data', 'translate-fields-progress.json');

// 学科名映射（手动翻译，8个）
const subjectMap = {
  'Computing': '信息技术',
  'English': '英语',
  'History': '历史',
  'Learning to Learn': '学习方法',
  'Life Skills': '生活技能',
  'Mathematics': '数学',
  'Personal & Social Development': '个人与社会发展',
  'Science': '科学',
};

// 类型映射（手动翻译，5个）
const typeMap = {
  'CONCEPTUAL': '概念性',
  'META': '元认知',
  'PROCEDURAL': '程序性',
  'LANGUAGE': '语言性',
  'REPRESENTATIONAL': '表征性',
};

// 加载进度
let progress = {};
if (fs.existsSync(progressPath)) {
  progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
} else {
  progress = { domains: {}, evidence: {}, assessment: {}, standards: {} };
}

function saveProgress() {
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf8');
}

async function translateText(text, type = 'general') {
  const cacheKey = `${type}:${text}`;
  if (progress.evidence[cacheKey] || progress.domains[cacheKey] || progress.assessment[cacheKey] || progress.standards[cacheKey]) {
    return progress.evidence[cacheKey] || progress.domains[cacheKey] || progress.assessment[cacheKey] || progress.standards[cacheKey];
  }

  let prompt = '';
  if (type === 'domain') {
    prompt = `把这个教育领域名称翻译成中文（K12教育领域）："${text}"。只输出中文翻译，不要加任何解释。`;
  } else if (type === 'evidence') {
    prompt = `把下面这条教育知识点的"掌握标准"翻译成地道的中文（K12教育术语），保持原意，语言简洁专业：\n"${text}"\n只输出中文翻译。`;
  } else if (type === 'assessment') {
    prompt = `把下面这条教育知识点的"评估提示"翻译成地道的中文（K12教育术语），保持原意：\n"${text}"\n只输出中文翻译。`;
  } else if (type === 'standard') {
    prompt = `把下面这条课程标准描述翻译成地道的中文（K12教育术语），保持原意：\n"${text}"\n只输出中文翻译。`;
  } else {
    prompt = `翻译成中文："${text}"`;
  }

  const maxRetry = 3;
  for (let i = 0; i < maxRetry; i++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
      
      if (progress.domains) progress.domains[cacheKey] = result;
      if (progress.evidence) progress.evidence[cacheKey] = result;
      if (progress.assessment) progress.assessment[cacheKey] = result;
      if (progress.standards) progress.standards[cacheKey] = result;
      
      return result;
    } catch (e) {
      if (i === maxRetry - 1) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

async function main() {
  if (!API_KEY) {
    console.error('❌ 请设置 DEEPSEEK_API_KEY 环境变量');
    process.exit(1);
  }

  const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
  const topics = topicsData.topics;

  // 1. 翻译学科和类型（直接替换）
  console.log('📚 替换学科名和类型...');
  topics.forEach(topic => {
    if (subjectMap[topic.subject]) topic.subject = subjectMap[topic.subject];
    if (typeMap[topic.type]) topic.type = typeMap[topic.type];
  });

  // 2. 翻译领域名（54个）
  const domains = [...new Set(topics.map(t => t.domain))];
  console.log(`🌐 翻译领域名: ${domains.length} 个`);
  let domainDone = 0;
  for (const domain of domains) {
    const key = `domain:${domain}`;
    if (!progress.domains[key]) {
      const translated = await translateText(domain, 'domain');
      progress.domains[key] = translated;
      domainDone++;
      if (domainDone % 10 === 0) {
        saveProgress();
        console.log(`  领域进度: ${domainDone}/${domains.length}`);
      }
    }
  }
  saveProgress();
  console.log(`✅ 领域翻译完成: ${domains.length} 个`);

  // 替换领域名
  topics.forEach(topic => {
    const key = `domain:${topic.domain}`;
    if (progress.domains[key]) topic.domain = progress.domains[key];
  });

  // 3. 翻译掌握标准（4727条）
  console.log(`📝 翻译掌握标准...`);
  let evidenceDone = 0;
  let evidenceTotal = 0;
  topics.forEach(t => { if (t.evidence) evidenceTotal += t.evidence.length; });
  
  for (const topic of topics) {
    if (!topic.evidence) continue;
    const translatedEvidence = [];
    for (const ev of topic.evidence) {
      const key = `evidence:${ev}`;
      if (progress.evidence[key]) {
        translatedEvidence.push(progress.evidence[key]);
      } else {
        const translated = await translateText(ev, 'evidence');
        progress.evidence[key] = translated;
        translatedEvidence.push(translated);
        evidenceDone++;
        if (evidenceDone % 50 === 0) {
          saveProgress();
          console.log(`  掌握标准进度: ${evidenceDone}/${evidenceTotal}`);
        }
      }
    }
    topic.evidence = translatedEvidence;
  }
  saveProgress();
  console.log(`✅ 掌握标准翻译完成: ${evidenceTotal} 条`);

  // 4. 翻译评估提示（1590条）
  console.log(`🎯 翻译评估提示...`);
  let assessDone = 0;
  for (const topic of topics) {
    if (!topic.assessmentPrompt) continue;
    const key = `assessment:${topic.assessmentPrompt}`;
    if (progress.assessment[key]) {
      topic.assessmentPrompt = progress.assessment[key];
    } else {
      const translated = await translateText(topic.assessmentPrompt, 'assessment');
      progress.assessment[key] = translated;
      topic.assessmentPrompt = translated;
      assessDone++;
      if (assessDone % 50 === 0) {
        saveProgress();
        console.log(`  评估提示进度: ${assessDone}/1590`);
      }
    }
  }
  saveProgress();
  console.log(`✅ 评估提示翻译完成: ${assessDone} 条`);

  // 5. 翻译课标对齐（1859条）
  console.log(`📋 翻译课标对齐...`);
  let stdDone = 0;
  let stdTotal = 0;
  topics.forEach(t => {
    if (t.standards) {
      Object.values(t.standards).forEach(arr => { stdTotal += arr.length; });
    }
  });

  for (const topic of topics) {
    if (!topic.standards) continue;
    for (const [standard, items] of Object.entries(topic.standards)) {
      const translatedItems = [];
      for (const item of items) {
        const key = `standard:${item}`;
        if (progress.standards[key]) {
          translatedItems.push(progress.standards[key]);
        } else {
          const translated = await translateText(item, 'standard');
          progress.standards[key] = translated;
          translatedItems.push(translated);
          stdDone++;
          if (stdDone % 50 === 0) {
            saveProgress();
            console.log(`  课标进度: ${stdDone}/${stdTotal}`);
          }
        }
      }
      topic.standards[standard] = translatedItems;
    }
  }
  saveProgress();
  console.log(`✅ 课标翻译完成: ${stdTotal} 条`);

  // 保存最终文件
  fs.writeFileSync(topicsPath, JSON.stringify(topicsData, null, 2), 'utf8');
  console.log('\n🎉 所有字段翻译完成！');
  console.log(`📄 文件已保存: ${topicsPath}`);
}

main().catch(e => {
  console.error('❌ 错误:', e.message);
  saveProgress();
  process.exit(1);
});
