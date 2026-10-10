/**
 * 三宝学堂 - 知识图谱批量翻译脚本（稳定单条版）
 * 逐条翻译 + 自动重试 + 断点续传
 */

const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const API_KEY = process.env.DOUBAO_API_KEY || '';
const MODEL = 'deepseek-chat'; // DeepSeek
const ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const MAX_RETRY = 3;
const DELAY_MS = 200;
const TIMEOUT_MS = 60000; // 60秒超时

const subjectMap = {
  'Science': '科学', 'Mathematics': '数学', 'English': '英语',
  'History': '历史', 'Personal & Social Development': '个人与社会发展',
  'Life Skills': '生活技能', 'Computing': '计算机', 'Learning to Learn': '学习方法'
};

const domainMap = {
  'Artificial Intelligence': '人工智能', 'Biology': '生物学', 'Chemistry': '化学',
  'Physics': '物理学', 'Earth Science': '地球科学', 'Numbers & Operations': '数字与运算',
  'Geometry & Measurement': '几何与测量', 'Algebra & Functions': '代数与函数',
  'Statistics & Probability': '统计与概率', 'Reading': '阅读', 'Writing': '写作',
  'Speaking & Listening': '听说', 'Grammar & Vocabulary': '语法与词汇',
  'World History': '世界历史', 'US History': '美国历史', 'Civics': '公民教育',
  'Geography': '地理', 'Self-Awareness': '自我认知', 'Social Awareness': '社会意识',
  'Self-Management': '自我管理', 'Relationship Skills': '人际交往',
  'Responsible Decision-Making': '负责任的决策', 'Daily Living': '日常生活',
  'Health & Safety': '健康与安全', 'Financial Literacy': '财商教育',
  'Coding & Programming': '编程', 'Digital Literacy': '数字素养',
  'Computer Systems': '计算机系统', 'Internet & Communication': '互联网与通信',
  'Cybersecurity': '网络安全', 'Metacognition': '元认知', 'Study Skills': '学习技巧',
  'Growth Mindset': '成长型思维', 'Creativity & Innovation': '创造力与创新',
  'Critical Thinking': '批判性思维'
};

async function main() {
  if (!API_KEY) { console.log('❌ 请提供豆包 API Key'); process.exit(1); }

  console.log('📚 三宝学堂 - 批量翻译（稳定版）\n');

  const topicsPath = path.join(__dirname, 'data', 'topics.json');
  const outputPath = path.join(__dirname, 'data', 'topics.zh.json');
  const progressPath = path.join(__dirname, 'data', 'translate-progress.json');

  const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
  const totalTopics = topicsData.topics.length;
  
  let translated = {};
  if (fs.existsSync(progressPath)) {
    translated = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    console.log(`📖 已翻译: ${Object.keys(translated).length} / ${totalTopics}`);
  }

  const toTranslate = topicsData.topics.filter(t => !translated[t.id]);
  console.log(`📝 待翻译: ${toTranslate.length} 个\n`);

  if (toTranslate.length === 0) {
    console.log('✅ 全部完成！');
    saveOutput(translated, topicsData, outputPath);
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < toTranslate.length; i++) {
    const topic = toTranslate[i];
    const progress = Object.keys(translated).length + successCount + 1;
    const pct = ((progress / totalTopics) * 100).toFixed(1);
    
    process.stdout.write(`[${progress}/${totalTopics}] ${pct}%  ${topic.name.substring(0,35).padEnd(35)}  `);
    
    let result = null;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        result = await translateOne(topic);
        // 验证id一致
        if (result.id !== topic.id) {
          result.id = topic.id; // 修正ID
        }
        break;
      } catch (e) {
        if (attempt < MAX_RETRY) {
          process.stdout.write(`⏳${attempt} `);
          await sleep(2000 * attempt);
        }
      }
    }

    if (result && result.id) {
      translated[result.id] = result;
      successCount++;
      console.log('✅');
    } else {
      failCount++;
      console.log('❌');
    }

    // 每10个保存进度
    if ((successCount + failCount) % 10 === 0) {
      fs.writeFileSync(progressPath, JSON.stringify(translated, null, 2));
    }

    // 每50个显示预计时间
    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const perItem = elapsed / (successCount + failCount);
      const remaining = Math.round(perItem * (toTranslate.length - i - 1));
      const hours = Math.floor(remaining / 3600);
      const mins = Math.floor((remaining % 3600) / 60);
      console.log(`   ⏱️  预计还剩 ${hours}小时${mins}分 | 成功${successCount} 失败${failCount}\n`);
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(progressPath, JSON.stringify(translated, null, 2));
  saveOutput(translated, topicsData, outputPath);
  
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  const h = Math.floor(totalTime/3600);
  const m = Math.floor((totalTime%3600)/60);
  const s = totalTime%60;
  console.log('\n🎉 翻译完成！');
  console.log(`   成功: ${successCount}  失败: ${failCount}`);
  console.log(`   用时: ${h}时${m}分${s}秒`);
  
  if (failCount > 0) console.log('\n💡 重新运行会自动重试失败的');
}

async function translateOne(topic) {
  const systemPrompt = `你是专业的儿童教育翻译专家。将英文知识点翻译成简体中文。
要求：语言自然，适合中国孩子；术语准确；保持原意；只输出JSON。
格式：{"id":"原ID","name":"中文名","description":"中文描述","evidence":["..."],"subject_zh":"学科","domain_zh":"领域"}`;

  const userContent = `ID: ${topic.id}
学科: ${topic.subject}
领域: ${topic.domain}
年龄: ${topic.ageRangeStart}-${topic.ageRangeEnd}岁
名称: ${topic.name}
描述: ${topic.description}
掌握标准:
${topic.evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

  const response = await callAPI(systemPrompt, userContent);
  
  let jsonStr = response;
  // 清理代码块标记
  jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('无JSON');
  
  return JSON.parse(jsonMatch[0]);
}

async function callAPI(systemPrompt, userContent) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.3,
        max_tokens: 1500
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API错误 ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('超时');
    throw e;
  }
}

function saveOutput(translated, topicsData, outputPath) {
  const zhTopics = topicsData.topics.map(topic => {
    const tr = translated[topic.id];
    if (!tr) return topic;
    return {
      ...topic,
      name_zh: tr.name || topic.name,
      description_zh: tr.description || topic.description,
      evidence_zh: tr.evidence || topic.evidence,
      subject_zh: tr.subject_zh || subjectMap[topic.subject] || topic.subject,
      domain_zh: tr.domain_zh || domainMap[topic.domain] || topic.domain
    };
  });

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 已保存到 ${outputPath}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(e => {
  console.error('\n❌ 错误:', e.message);
  process.exit(1);
});
