export interface LessonDefinition {
  id: string;
  title: string;
  summary: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationMinutes: number;
  topicId?: string;
}

export const lessonCatalog: LessonDefinition[] = [
  {
    id: 'intro-grammar',
    title: 'Базовые формы',
    summary: 'Повторяем времена и базовые правила',
    difficulty: 'easy',
    durationMinutes: 15,
    topicId: 'grammar-basics',
  },
  {
    id: 'listening-focus',
    title: 'Слушаем и пишем',
    summary: 'Комбинируем аудирование с письмом',
    difficulty: 'medium',
    durationMinutes: 20,
    topicId: 'listening',
  },
  {
    id: 'debate-club',
    title: 'Аргументируем',
    summary: 'Учимся отвечать развёрнуто за ограниченное время',
    difficulty: 'hard',
    durationMinutes: 30,
    topicId: 'debate',
  },
];
