/**
 * 三宝学堂 - 知识图谱批量翻译脚本
 * 使用豆包 API 将英文知识点翻译为中文
 * 支持断点续传
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ========== 配置 ==========
const API_KEY = process.env.DOUBAO_API_KEY || ''; // 环境变量或直接填入
const MODEL = 'doubao-seed-1-6-flash-250828';
const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const BATCH_SIZE = 10; // 每次翻译多少个
const DELAY_MS = 500; // 每次请求间隔

// 学科名标准翻译
const subjectMap = {
  'Science': '科学',
  'Mathematics': '数学',
  'English': '英语',
  'History': '历史',
  'Personal & Social Development': '个人与社会发展',
  'Life Skills': '生活技能',
  'Computing': '计算机',
  'Learning to Learn': '学习方法'
};

// 领域名常见翻译
const domainMap = {
  'Artificial Intelligence': '人工智能',
  'Biology': '生物学',
  'Chemistry': '化学',
  'Physics': '物理学',
  'Earth Science': '地球科学',
  'Numbers & Operations': '数字与运算',
  'Geometry & Measurement': '几何与测量',
  'Algebra & Functions': '代数与函数',
  'Statistics & Probability': '统计与概率',
  'Reading': '阅读',
  'Writing': '写作',
  'Speaking & Listening': '听说',
  'Grammar & Vocabulary': '语法与词汇',
  'World History': '世界历史',
  'US History': '美国历史',
  'Civics': '公民教育',
  'Geography': '地理',
  'Self-Awareness': '自我认知',
  'Social Awareness': '社会意识',
  'Self-Management': '自我管理',
  'Relationship Skills': '人际交往',
  'Responsible Decision-Making': '负责任的决策',
  'Daily Living': '日常生活',
  'Health & Safety': '健康与安全',
  'Financial Literacy': '财商教育',
  'Coding & Programming': '编程',
  'Digital Literacy': '数字素养',
  'Computer Systems': '计算机系统',
  'Internet & Communication': '互联网与通信',
  'Cybersecurity': '网络安全',
  'Metacognition': '元认知',
  'Study Skills': '学习技巧',
  'Growth Mindset': '成长型思维',
  'Creativity & Innovation': '创造力与创新',
  'Critical Thinking': '批判性思维'
};

// ========== 主函数 ==========
async function main() {
  const args = process.argv.slice(2);
  
  // 读取 API Key
  let apiKey = API_KEY;
  if (!apiKey) {
    const keyArg = args.find(a => a.startsWith('--key='));
    if (keyArg) {
      apiKey = keyArg.split('=')[1];
    }
  }
  
  if (!apiKey) {
    console.log('❌ 请提供豆包 API Key');
    console.log('用法: node translate-topics.js --key=你的APIKEY');
    console.log('  或设置环境变量: set DOUBAO_API_KEY=你的APIKEY');
    process.exit(1);
  }

  console.log('📚 三宝学堂 - 批量翻译工具\n');

  // 读取数据
  const topicsPath = path.join(__dirname, 'data', 'topics.json');
  const depsPath = path.join(__dirname, 'data', 'dependencies.json');
  const outputPath = path.join(__dirname, 'data', 'topics.zh.json');
  const progressPath = path.join(__dirname, 'data', 'translate-progress.json');

  if (!fs.existsSync(topicsPath)) {
    console.log('❌ 找不到 topics.json');
    process.exit(1);
  }

  const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
  const totalTopics = topicsData.topics.length;
  
  // 读取已有进度
  let translated = {};
  if (fs.existsSync(progressPath)) {
    translated = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    console.log(`📖 找到已翻译进度: ${Object.keys(translated).length} / ${totalTopics}`);
  }

  // 找出未翻译的
  const toTranslate = topicsData.topics.filter(t => !translated[t.id]);
  console.log(`📝 待翻译: ${toTranslate.length} 个知识点\n`);

  if (toTranslate.length === 0) {
    console.log('✅ 全部翻译完成！');
    saveOutput(translated, topicsData, outputPath);
    process.exit(0);
  }

  // 分批翻译
  const batches = [];
  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    batches.push(toTranslate.slice(i, i + BATCH_SIZE));
  }

  console.log(`🚀 开始翻译，共 ${batches.length} 批...\n`);

  let successCount = 0;
  let failCount = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(`[${bi + 1}/${batches.length}] 翻译第 ${bi + 1} 批 (${batch.length} 个)...`);

    try {
      const results = await translateBatch(apiKey, batch);
      
      for (const result of results) {
        if (result && result.id) {
          translated[result.id] = result;
          successCount++;
        }
      }

      // 保存进度
      fs.writeFileSync(progressPath, JSON.stringify(translated, null, 2));
      
      console.log(`   ✅ 完成 ${successCount + Object.keys(translated).length - batch.length + results.filter(r=>r).length} / ${totalTopics}`);

    } catch (e) {
      failCount += batch.length;
      console.log(`   ❌ 批次失败: ${e.message}`);
    }

    // 延迟
    if (bi < batches.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // 保存最终结果
  saveOutput(translated, topicsData, outputPath);
  
  console.log('\n🎉 翻译完成！');
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${failCount}`);
  console.log(`   输出: ${outputPath}`);
  
  if (failCount > 0) {
    console.log('\n💡 有失败的批次，重新运行脚本会自动重试未翻译的内容');
  }
}

// ========== 翻译一批 ==========
async function translateBatch(apiKey, topics) {
  const systemPrompt = `你是一个专业的教育内容翻译专家，负责将儿童教育知识图谱从英文翻译成简体中文。

翻译要求：
1. 语言要自然、流畅，适合中国孩子理解
2. 针对不同年龄段调整用词：低龄（4-7岁）用简单活泼的语言，高龄（10+岁）可以更专业
3. 专业术语要准确，符合国内教育体系的常用说法
4. 保持原意，不要删减或添加内容
5. 输出严格的JSON格式，不要有任何额外文字

请翻译以下内容，输出JSON数组，每个元素包含：
- id: 原ID（原样保留）
- name: 中文名称
- description: 中文描述
- evidence: 中文掌握标准（数组）
- subject_zh: 学科中文名
- domain_zh: 领域中文名`;

  const userContent = topics.map(t => `ID: ${t.id}
学科: ${t.subject}
领域: ${t.domain}
年龄: ${t.ageRangeStart}-${t.ageRangeEnd}岁
名称: ${t.name}
描述: ${t.description}
掌握标准:
${t.evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}
---`).join('\n\n');

  const response = await callAPI(apiKey, systemPrompt, userContent);
  
  // 解析返回的 JSON
  try {
    // 找到 JSON 数组
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('无法解析返回的 JSON');
    }
    const results = JSON.parse(jsonMatch[0]);
    return results;
  } catch (e) {
    console.log('   ⚠️ JSON解析失败，尝试单个翻译...');
    // 降级：逐个翻译
    const results = [];
    for (const topic of topics) {
      try {
        const single = await translateSingle(apiKey, topic);
        results.push(single);
        await sleep(200);
      } catch (e2) {
        console.log(`      跳过 ${topic.id}: ${e2.message}`);
      }
    }
    return results;
  }
}

// ========== 单个翻译（降级方案） ==========
async function translateSingle(apiKey, topic) {
  const systemPrompt = `你是一个专业的教育内容翻译专家。将下面的儿童教育知识点翻译成简体中文。
输出严格的JSON格式：{"id":"原ID","name":"中文名","description":"中文描述","evidence":["标准1","标准2"],"subject_zh":"学科","domain_zh":"领域"}
不要有任何额外文字。`;

  const userContent = `
ID: ${topic.id}
学科: ${topic.subject}
领域: ${topic.domain}
年龄: ${topic.ageRangeStart}-${topic.ageRangeEnd}岁
名称: ${topic.name}
描述: ${topic.description}
掌握标准:
${topic.evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

  const response = await callAPI(apiKey, systemPrompt, userContent);
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('解析失败');
  return JSON.parse(jsonMatch[0]);
}

// ========== 调用 API ==========
async function callAPI(apiKey, systemPrompt, userContent) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.3,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API错误 ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ========== 保存输出 ==========
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

  const output = {
    version: topicsData.version,
    language: 'zh-CN',
    topicCount: zhTopics.length,
    topics: zhTopics
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`💾 已保存到 ${outputPath}`);
}

// ========== 工具函数 ==========
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行
main().catch(e => {
  console.error('❌ 运行出错:', e.message);
  process.exit(1);
});
