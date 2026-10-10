// 合并中英文数据，生成中英对照版本
// 数据结构：每个文本字段变成 { zh: "中文", en: "English" }
const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, 'data', 'topics.en.json');
const zhPath = path.join(__dirname, 'data', 'topics.zh.json');
const outPath = path.join(__dirname, 'data', 'topics.bilingual.json');

const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const zhData = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

// 学科映射
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
const subjectMapReverse = {};
Object.entries(subjectMap).forEach(([en, zh]) => { subjectMapReverse[zh] = en; });

// 类型映射
const typeMap = {
  'CONCEPTUAL': '概念性',
  'META': '元认知',
  'PROCEDURAL': '程序性',
  'LANGUAGE': '语言性',
  'REPRESENTATIONAL': '表征性',
};
const typeMapReverse = {};
Object.entries(typeMap).forEach(([en, zh]) => { typeMapReverse[zh] = en; });

function bilingual(zhVal, enVal) {
  return { zh: zhVal || enVal || '', en: enVal || '' };
}

const bilingualTopics = zhData.topics.map((zhTopic, i) => {
  const enTopic = enData.topics[i]; // 按索引对应

  // 合并 evidence 数组
  const evidence = (zhTopic.evidence || []).map((zhEv, idx) => {
    const enEv = enTopic.evidence ? enTopic.evidence[idx] : '';
    return bilingual(zhEv, enEv);
  });

  // 合并 standards 对象
  const standards = {};
  if (zhTopic.standards) {
    for (const [key, zhArr] of Object.entries(zhTopic.standards)) {
      const enArr = enTopic.standards ? (enTopic.standards[key] || []) : [];
      standards[key] = zhArr.map((zhItem, idx) => bilingual(zhItem, enArr[idx]));
    }
  }

  return {
    id: zhTopic.id,
    type: bilingual(zhTopic.type, typeMapReverse[zhTopic.type] || enTopic.type),
    subject: bilingual(zhTopic.subject, subjectMapReverse[zhTopic.subject] || enTopic.subject),
    domain: bilingual(zhTopic.domain, enTopic.domain),
    name: bilingual(zhTopic.name, enTopic.name),
    description: bilingual(zhTopic.description, enTopic.description),
    ageRangeStart: zhTopic.ageRangeStart,
    ageRangeEnd: zhTopic.ageRangeEnd,
    centrality: zhTopic.centrality,
    evidence: evidence,
    assessmentPrompt: bilingual(zhTopic.assessmentPrompt, enTopic.assessmentPrompt),
    standards: standards,
  };
});

const result = { ...zhData, topics: bilingualTopics };
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

// 统计
let totalFields = 0;
let translatedFields = 0;
bilingualTopics.forEach(t => {
  ['name', 'description', 'subject', 'domain', 'type', 'assessmentPrompt'].forEach(f => {
    totalFields++;
    if (t[f].zh && t[f].zh !== t[f].en) translatedFields++;
  });
  (t.evidence || []).forEach(e => {
    totalFields++;
    if (e.zh && e.zh !== e.en) translatedFields++;
  });
  Object.values(t.standards || {}).forEach(arr => arr.forEach(s => {
    totalFields++;
    if (s.zh && s.zh !== s.en) translatedFields++;
  }));
});

console.log(`✅ 中英对照版本生成完成！`);
console.log(`📄 文件: ${outPath}`);
console.log(`📊 总字段数: ${totalFields}`);
console.log(`📊 已翻译: ${translatedFields} (${(translatedFields/totalFields*100).toFixed(1)}%)`);
console.log(`📊 未翻译: ${totalFields - translatedFields}`);
