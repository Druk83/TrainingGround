// MongoDB seed data for Template Generator
// Word forms and example sentences

print('[INFO] Loading seed data for Template Generator...');

const db = db.getSiblingDB('trainingground');

// Word forms - существительные (nouns)
const nouns = [
  { word: 'ученик', lemma: 'ученик', pos: 'noun', grammemes: { case: 'nomn', number: 'sing', gender: 'masc' }, frequency: 100 },
  { word: 'ученика', lemma: 'ученик', pos: 'noun', grammemes: { case: 'gent', number: 'sing', gender: 'masc' }, frequency: 100 },
  { word: 'ученику', lemma: 'ученик', pos: 'noun', grammemes: { case: 'datv', number: 'sing', gender: 'masc' }, frequency: 100 },
  { word: 'ученики', lemma: 'ученик', pos: 'noun', grammemes: { case: 'nomn', number: 'plur', gender: 'masc' }, frequency: 100 },
  { word: 'учеников', lemma: 'ученик', pos: 'noun', grammemes: { case: 'gent', number: 'plur', gender: 'masc' }, frequency: 100 },

  { word: 'учитель', lemma: 'учитель', pos: 'noun', grammemes: { case: 'nomn', number: 'sing', gender: 'masc' }, frequency: 90 },
  { word: 'учителя', lemma: 'учитель', pos: 'noun', grammemes: { case: 'gent', number: 'sing', gender: 'masc' }, frequency: 90 },
  { word: 'учителю', lemma: 'учитель', pos: 'noun', grammemes: { case: 'datv', number: 'sing', gender: 'masc' }, frequency: 90 },
  { word: 'учителя', lemma: 'учитель', pos: 'noun', grammemes: { case: 'nomn', number: 'plur', gender: 'masc' }, frequency: 90 },
  { word: 'учителей', lemma: 'учитель', pos: 'noun', grammemes: { case: 'gent', number: 'plur', gender: 'masc' }, frequency: 90 },

  { word: 'книга', lemma: 'книга', pos: 'noun', grammemes: { case: 'nomn', number: 'sing', gender: 'femn' }, frequency: 95 },
  { word: 'книги', lemma: 'книга', pos: 'noun', grammemes: { case: 'gent', number: 'sing', gender: 'femn' }, frequency: 95 },
  { word: 'книге', lemma: 'книга', pos: 'noun', grammemes: { case: 'datv', number: 'sing', gender: 'femn' }, frequency: 95 },
  { word: 'книги', lemma: 'книга', pos: 'noun', grammemes: { case: 'nomn', number: 'plur', gender: 'femn' }, frequency: 95 },
  { word: 'книг', lemma: 'книга', pos: 'noun', grammemes: { case: 'gent', number: 'plur', gender: 'femn' }, frequency: 95 },

  { word: 'школа', lemma: 'школа', pos: 'noun', grammemes: { case: 'nomn', number: 'sing', gender: 'femn' }, frequency: 85 },
  { word: 'школы', lemma: 'школа', pos: 'noun', grammemes: { case: 'gent', number: 'sing', gender: 'femn' }, frequency: 85 },
  { word: 'школе', lemma: 'школа', pos: 'noun', grammemes: { case: 'datv', number: 'sing', gender: 'femn' }, frequency: 85 },
  { word: 'школы', lemma: 'школа', pos: 'noun', grammemes: { case: 'nomn', number: 'plur', gender: 'femn' }, frequency: 85 },
  { word: 'школ', lemma: 'школа', pos: 'noun', grammemes: { case: 'gent', number: 'plur', gender: 'femn' }, frequency: 85 },

  { word: 'слово', lemma: 'слово', pos: 'noun', grammemes: { case: 'nomn', number: 'sing', gender: 'neut' }, frequency: 92 },
  { word: 'слова', lemma: 'слово', pos: 'noun', grammemes: { case: 'gent', number: 'sing', gender: 'neut' }, frequency: 92 },
  { word: 'слову', lemma: 'слово', pos: 'noun', grammemes: { case: 'datv', number: 'sing', gender: 'neut' }, frequency: 92 },
  { word: 'слова', lemma: 'слово', pos: 'noun', grammemes: { case: 'nomn', number: 'plur', gender: 'neut' }, frequency: 92 },
  { word: 'слов', lemma: 'слово', pos: 'noun', grammemes: { case: 'gent', number: 'plur', gender: 'neut' }, frequency: 92 },

  { word: 'предложение', lemma: 'предложение', pos: 'noun', grammemes: { case: 'nomn', number: 'sing', gender: 'neut' }, frequency: 88 },
  { word: 'предложения', lemma: 'предложение', pos: 'noun', grammemes: { case: 'gent', number: 'sing', gender: 'neut' }, frequency: 88 },
  { word: 'предложению', lemma: 'предложение', pos: 'noun', grammemes: { case: 'datv', number: 'sing', gender: 'neut' }, frequency: 88 },
  { word: 'предложения', lemma: 'предложение', pos: 'noun', grammemes: { case: 'nomn', number: 'plur', gender: 'neut' }, frequency: 88 },
  { word: 'предложений', lemma: 'предложение', pos: 'noun', grammemes: { case: 'gent', number: 'plur', gender: 'neut' }, frequency: 88 },

  { word: 'дом', lemma: 'дом', pos: 'noun', grammemes: { case: 'nomn', number: 'sing', gender: 'masc' }, frequency: 80 },
  { word: 'дома', lemma: 'дом', pos: 'noun', grammemes: { case: 'gent', number: 'sing', gender: 'masc' }, frequency: 80 },
  { word: 'дому', lemma: 'дом', pos: 'noun', grammemes: { case: 'datv', number: 'sing', gender: 'masc' }, frequency: 80 },
  { word: 'дома', lemma: 'дом', pos: 'noun', grammemes: { case: 'nomn', number: 'plur', gender: 'masc' }, frequency: 80 },
  { word: 'домов', lemma: 'дом', pos: 'noun', grammemes: { case: 'gent', number: 'plur', gender: 'masc' }, frequency: 80 },

  { word: 'город', lemma: 'город', pos: 'noun', grammemes: { case: 'nomn', number: 'sing', gender: 'masc' }, frequency: 78 },
  { word: 'города', lemma: 'город', pos: 'noun', grammemes: { case: 'gent', number: 'sing', gender: 'masc' }, frequency: 78 },
  { word: 'городу', lemma: 'город', pos: 'noun', grammemes: { case: 'datv', number: 'sing', gender: 'masc' }, frequency: 78 },
  { word: 'города', lemma: 'город', pos: 'noun', grammemes: { case: 'nomn', number: 'plur', gender: 'masc' }, frequency: 78 },
  { word: 'городов', lemma: 'город', pos: 'noun', grammemes: { case: 'gent', number: 'plur', gender: 'masc' }, frequency: 78 }
];

// Word forms - глаголы (verbs)
const verbs = [
  { word: 'читать', lemma: 'читать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'inf' }, frequency: 85 },
  { word: 'читаю', lemma: 'читать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '1per', number: 'sing' }, frequency: 85 },
  { word: 'читаешь', lemma: 'читать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '2per', number: 'sing' }, frequency: 85 },
  { word: 'читает', lemma: 'читать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '3per', number: 'sing' }, frequency: 85 },

  { word: 'писать', lemma: 'писать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'inf' }, frequency: 82 },
  { word: 'пишу', lemma: 'писать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '1per', number: 'sing' }, frequency: 82 },
  { word: 'пишешь', lemma: 'писать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '2per', number: 'sing' }, frequency: 82 },
  { word: 'пишет', lemma: 'писать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '3per', number: 'sing' }, frequency: 82 },

  { word: 'учиться', lemma: 'учиться', pos: 'verb', grammemes: { aspect: 'impf', tense: 'inf' }, frequency: 80 },
  { word: 'учусь', lemma: 'учиться', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '1per', number: 'sing' }, frequency: 80 },
  { word: 'учишься', lemma: 'учиться', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '2per', number: 'sing' }, frequency: 80 },
  { word: 'учится', lemma: 'учиться', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '3per', number: 'sing' }, frequency: 80 },

  { word: 'думать', lemma: 'думать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'inf' }, frequency: 75 },
  { word: 'думаю', lemma: 'думать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '1per', number: 'sing' }, frequency: 75 },
  { word: 'думаешь', lemма: 'думать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '2per', number: 'sing' }, frequency: 75 },
  { word: 'думает', lemma: 'думать', pos: 'verb', grammemes: { aspect: 'impf', tense: 'pres', person: '3per', number: 'sing' }, frequency: 75 }
];

// Word forms - прилагательные (adjectives)
const adjectives = [
  { word: 'новый', lemma: 'новый', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'masc' }, frequency: 70 },
  { word: 'нового', lemma: 'новый', pos: 'adjective', grammemes: { case: 'gent', number: 'sing', gender: 'masc' }, frequency: 70 },
  { word: 'новому', lemma: 'новый', pos: 'adjective', grammemes: { case: 'datv', number: 'sing', gender: 'masc' }, frequency: 70 },
  { word: 'новая', lemma: 'новый', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'femn' }, frequency: 70 },
  { word: 'новое', lemma: 'новый', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'neut' }, frequency: 70 },
  { word: 'новые', lemma: 'новый', pos: 'adjective', grammemes: { case: 'nomn', number: 'plur' }, frequency: 70 },

  { word: 'хороший', lemma: 'хороший', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'masc' }, frequency: 68 },
  { word: 'хорошего', lemma: 'хороший', pos: 'adjective', grammemes: { case: 'gent', number: 'sing', gender: 'masc' }, frequency: 68 },
  { word: 'хорошему', lemma: 'хороший', pos: 'adjective', grammemes: { case: 'datv', number: 'sing', gender: 'masc' }, frequency: 68 },
  { word: 'хорошая', lemma: 'хороший', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'femn' }, frequency: 68 },
  { word: 'хорошее', lemma: 'хороший', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'neut' }, frequency: 68 },
  { word: 'хорошие', lemma: 'хороший', pos: 'adjective', grammemes: { case: 'nomn', number: 'plur' }, frequency: 68 },

  { word: 'большой', lemma: 'большой', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'masc' }, frequency: 65 },
  { word: 'большого', lemma: 'большой', pos: 'adjective', grammemes: { case: 'gent', number: 'sing', gender: 'masc' }, frequency: 65 },
  { word: 'большому', lemma: 'большой', pos: 'adjective', grammemes: { case: 'datv', number: 'sing', gender: 'masc' }, frequency: 65 },
  { word: 'большая', lemma: 'большой', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'femn' }, frequency: 65 },
  { word: 'большое', lemma: 'большой', pos: 'adjective', grammemes: { case: 'nomn', number: 'sing', gender: 'neut' }, frequency: 65 },
  { word: 'большие', lemma: 'большой', pos: 'adjective', grammemes: { case: 'nomn', number: 'plur' }, frequency: 65 }
];

// Insert word forms
const allWords = [...nouns, ...verbs, ...adjectives];
db.word_forms.insertMany(allWords);
print(`[SUCCESS] Inserted ${allWords.length} word forms`);

// Example sentences
const exampleSentences = [
  { text: 'Ученик читает книгу.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 19 },
  { text: 'Учитель объясняет правило.', topic: 'syntax', level: 'beginner', tags: ['simple', 'declarative'], length: 26 },
  { text: 'В школе много учеников.', topic: 'punctuation', level: 'beginner', tags: ['simple', 'declarative'], length: 23 },
  { text: 'Дети пишут упражнение в тетради.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 32 },
  { text: 'Новая книга лежит на столе.', topic: 'syntax', level: 'beginner', tags: ['simple', 'declarative'], length: 27 },
  { text: 'Мальчик думает о задаче.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 24 },
  { text: 'Учитель спрашивает ученика.', topic: 'syntax', level: 'intermediate', tags: ['simple', 'interrogative'], length: 27 },
  { text: 'Ребята учатся в школе.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 22 },
  { text: 'Большой дом стоит на холме.', topic: 'syntax', level: 'intermediate', tags: ['simple', 'declarative'], length: 27 },
  { text: 'Девочка читает интересную книгу.', topic: 'orthography', level: 'intermediate', tags: ['simple', 'declarative'], length: 32 },

  { text: 'Найди подлежащее в предложении.', topic: 'syntax', level: 'intermediate', tags: ['imperative', 'task'], length: 32 },
  { text: 'Определи падеж существительного.', topic: 'morphology', level: 'intermediate', tags: ['imperative', 'task'], length: 33 },
  { text: 'Вставь пропущенную букву.', topic: 'orthography', level: 'beginner', tags: ['imperative', 'task'], length: 25 },
  { text: 'Поставь правильный знак препинания.', topic: 'punctuation', level: 'intermediate', tags: ['imperative', 'task'], length: 36 },
  { text: 'Выбери синоним к слову.', topic: 'lexicon', level: 'advanced', tags: ['imperative', 'task'], length: 23 },

  { text: 'Солнце светит ярко.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 19 },
  { text: 'Птицы поют весной.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 18 },
  { text: 'Река течёт быстро.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 18 },
  { text: 'Мама готовит обед.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 18 },
  { text: 'Папа читает газету.', topic: 'orthography', level: 'beginner', tags: ['simple', 'declarative'], length: 20 },

  { text: 'Когда наступит весна, расцветут цветы.', topic: 'syntax', level: 'advanced', tags: ['complex', 'subordinate'], length: 39 },
  { text: 'Если будет дождь, мы останемся дома.', topic: 'syntax', level: 'advanced', tags: ['complex', 'conditional'], length: 37 },
  { text: 'Книга, которую я читал, очень интересная.', topic: 'syntax', level: 'advanced', tags: ['complex', 'relative'], length: 42 },
  { text: 'Дом, где я живу, находится в центре города.', topic: 'syntax', level: 'advanced', tags: ['complex', 'relative'], length: 44 },
  { text: 'Хотя шёл дождь, дети играли на улице.', topic: 'syntax', level: 'advanced', tags: ['complex', 'concessive'], length: 38 }
];

db.example_sentences.insertMany(exampleSentences);
print(`[SUCCESS] Inserted ${exampleSentences.length} example sentences`);

// Feature flags seed data
print('[INFO] Loading feature flags...');
const now = new Date();
const featureFlags = [
  {
    flag_key: 'hints_enabled',
    description: 'Enable/disable hint system for students',
    enabled: true,
    scope: 'global',
    target_ids: [],
    config: { max_hints_per_task: 3, hint_penalty: 5 },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup'
  },
  {
    flag_key: 'explanation_api_enabled',
    description: 'Enable/disable explanation API access',
    enabled: true,
    scope: 'global',
    target_ids: [],
    config: { max_requests_per_hour: 100 },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup'
  },
  {
    flag_key: 'explanation_yandexgpt_enabled',
    description: 'Enable/disable YandexGPT for explanation generation',
    enabled: false,
    scope: 'global',
    target_ids: [],
    config: { model: 'yandexgpt-3', temperature: 0.7 },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup - disabled for cost control'
  },
  {
    flag_key: 'adaptive_templates_enabled',
    description: 'Enable/disable adaptive template generation',
    enabled: true,
    scope: 'global',
    target_ids: [],
    config: { adaptation_level: 'medium' },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup'
  },
  {
    flag_key: 'sso_oauth2',
    description: 'Enable/disable OAuth2 SSO integration',
    enabled: false,
    scope: 'global',
    target_ids: [],
    config: { providers: ['yandex', 'vk', 'gosuslugi'] },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup - disabled for security review'
  },
  {
    flag_key: 'scoring_bonus_v2',
    description: 'Enable/disable new scoring bonus algorithm v2',
    enabled: false,
    scope: 'global',
    target_ids: [],
    config: { bonus_multiplier: 1.5, min_accuracy: 85 },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup - disabled pending testing'
  },
  {
    flag_key: 'anticheat_strict_mode',
    description: 'Enable/disable strict anticheat mode',
    enabled: true,
    scope: 'global',
    target_ids: [],
    config: { tab_switch_threshold: 3, rapid_submit_ms: 500 },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup'
  },
  {
    flag_key: 'qdrant_fallback',
    description: 'Enable/disable fallback to Qdrant when primary search fails',
    enabled: true,
    scope: 'global',
    target_ids: [],
    config: { timeout_ms: 5000, fallback_score_threshold: 0.5 },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup'
  },
  {
    flag_key: 'leaderboard_enabled',
    description: 'Enable/disable leaderboard feature',
    enabled: true,
    scope: 'global',
    target_ids: [],
    config: { update_frequency_minutes: 60 },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup'
  },
  {
    flag_key: 'offline_sync_enabled',
    description: 'Enable/disable offline synchronization',
    enabled: false,
    scope: 'global',
    target_ids: [],
    config: { max_offline_queue_size: 1000 },
    version: 1,
    updated_at: now,
    updated_by: 'system',
    change_reason: 'Initial setup - disabled pending PWA implementation'
  }
];

db.feature_flags.insertMany(featureFlags);
print(`[SUCCESS] Inserted ${featureFlags.length} feature flags`);

print('[SUCCESS] Seed data loaded');
