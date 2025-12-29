export interface LessonDefinition {
  id: string;
  title: string;
  summary: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationMinutes: number;
  topicId?: string;
  levels: number;
}

export const lessonCatalog: LessonDefinition[] = [
  {
    id: 'intro-grammar',
    title: 'Грамматические основы',
    summary: 'Комбинируйте чтение и грамматику для уверенного письма',
    difficulty: 'easy',
    durationMinutes: 15,
    topicId: 'grammar-basics',
    levels: 5,
  },
  {
    id: 'listening-focus',
    title: 'Фокус на слушании',
    summary: 'Тренируйте восприятие речи на слух в сложных ситуациях',
    difficulty: 'medium',
    durationMinutes: 20,
    topicId: 'listening',
    levels: 4,
  },
  {
    id: 'debate-club',
    title: 'Дискуссии и аргументация',
    summary: 'Выстраивайте аргументы и отстаивайте позицию на русском',
    difficulty: 'hard',
    durationMinutes: 30,
    topicId: 'debate',
    levels: 6,
  },
];
