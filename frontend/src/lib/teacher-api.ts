/**
 * Teacher API utilities
 * Вспомогательные функции и типы для работы с Teacher endpoints
 */

import { ApiClient } from './api-client';
import type {
  ActivityEntry,
  CreateNotificationTemplatePayload,
  ExportRequestPayload,
  ExportResponsePayload,
  ExportStatusPayload,
  GroupResponse,
  NotificationHistoryEntry,
  NotificationTemplate,
  RecommendationEntry,
  SendNotificationPayload,
  SendNotificationResponse,
  TeacherStudentDetail,
  TeacherStudentSummary,
  TopicAnalyticsEntry,
} from './api-types';

/**
 * Teacher API helper class
 * Предоставляет удобные методы для работы с Teacher endpoints
 */
export class TeacherApi {
  private client: ApiClient;

  constructor(client: ApiClient) {
    this.client = client;
  }

  /**
   * Получить группы, которыми управляет куратор
   */
  async getMyGroups(): Promise<GroupResponse[]> {
    return this.client.listTeacherGroups();
  }

  /**
   * Получить студентов в группе
   */
  async getGroupStudents(groupId: string): Promise<TeacherStudentSummary[]> {
    return this.client.listTeacherGroupStudents(groupId);
  }

  /**
   * Получить детальную информацию о студенте
   */
  async getStudentDetail(
    groupId: string,
    studentId: string,
  ): Promise<TeacherStudentDetail> {
    return this.client.getTeacherStudentDetail(groupId, studentId);
  }

  /**
   * Получить статистику по темам группы
   */
  async getTopicsAnalytics(groupId: string): Promise<TopicAnalyticsEntry[]> {
    return this.client.getGroupTopicAnalytics(groupId);
  }

  /**
   * Получить активность группы за последние дни
   */
  async getGroupActivity(groupId: string): Promise<ActivityEntry[]> {
    return this.client.getGroupActivity(groupId);
  }

  /**
   * Получить рекомендации для группы
   */
  async getRecommendations(groupId: string): Promise<RecommendationEntry[]> {
    return this.client.getGroupRecommendations(groupId);
  }

  /**
   * Получить шаблоны писем куратора
   */
  async getNotificationTemplates(): Promise<NotificationTemplate[]> {
    return this.client.listTeacherNotificationTemplates();
  }

  /**
   * Создать новый шаблон письма
   */
  async createNotificationTemplate(
    payload: CreateNotificationTemplatePayload,
  ): Promise<NotificationTemplate> {
    return this.client.createTeacherNotificationTemplate(payload);
  }

  /**
   * Отправить уведомление группе студентов
   */
  async sendNotification(
    payload: SendNotificationPayload,
  ): Promise<SendNotificationResponse> {
    return this.client.sendTeacherNotification(payload);
  }

  /**
   * Получить историю отправленных уведомлений
   */
  async getNotificationHistory(): Promise<NotificationHistoryEntry[]> {
    return this.client.listTeacherNotificationHistory();
  }

  /**
   * Запросить экспорт (отчёт) группы
   */
  async requestExport(
    groupId: string,
    payload: ExportRequestPayload,
  ): Promise<ExportResponsePayload> {
    return this.client.requestGroupExport(groupId, payload);
  }

  /**
   * Получить статус экспорта
   */
  async getExportStatus(exportId: string): Promise<ExportStatusPayload> {
    return this.client.getExportStatus(exportId);
  }

  /**
   * Получить студентов, которые не заходили более N дней
   */
  async getInactiveStudents(
    groupId: string,
    daysThreshold = 7,
  ): Promise<TeacherStudentSummary[]> {
    const students = await this.getGroupStudents(groupId);
    const now = new Date();
    return students.filter((student) => {
      if (!student.last_login_at) return true;
      const lastLogin = new Date(student.last_login_at);
      const daysSinceLogin =
        (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceLogin > daysThreshold;
    });
  }

  /**
   * Получить студентов с низкой точностью
   */
  async getLowPerformanceStudents(
    groupId: string,
    threshold = 70,
  ): Promise<TeacherStudentSummary[]> {
    const students = await this.getGroupStudents(groupId);
    return students.filter((student) => (student.accuracy ?? 100) < threshold);
  }

  /**
   * Вычислить среднюю статистику группы
   */
  async getGroupStats(groupId: string) {
    const [students, topics, activity] = await Promise.all([
      this.getGroupStudents(groupId),
      this.getTopicsAnalytics(groupId),
      this.getGroupActivity(groupId),
    ]);

    const avgAccuracy =
      students.length > 0
        ? students.reduce((sum, s) => sum + (s.accuracy ?? 0), 0) / students.length
        : 0;

    const avgScore =
      students.length > 0
        ? students.reduce((sum, s) => sum + (s.total_score ?? 0), 0) / students.length
        : 0;

    const totalAttempts = students.reduce((sum, s) => sum + (s.total_attempts ?? 0), 0);

    const topicCount = topics.length;
    const completedTopics = topics.filter((t) => (t.avg_percentage ?? 0) >= 80).length;

    return {
      studentCount: students.length,
      activeStudents: students.filter((s) => s.last_login_at).length,
      avgAccuracy,
      avgScore,
      totalAttempts,
      topicCount,
      completedTopics,
      activityTrend:
        activity.length > 0 ? (activity[activity.length - 1].avg_percentage ?? 0) : 0,
    };
  }

  /**
   * Отправить письмо неактивным студентам
   */
  async notifyInactiveStudents(
    groupId: string,
    templateId: string,
    daysThreshold = 7,
  ): Promise<SendNotificationResponse> {
    const inactiveStudents = await this.getInactiveStudents(groupId, daysThreshold);
    const studentIds = inactiveStudents.map((s) => s.id);

    return this.sendNotification({
      group_id: groupId,
      template_id: templateId,
      student_ids: studentIds,
    });
  }

  /**
   * Отправить письмо студентам с низкой успеваемостью
   */
  async notifyLowPerformanceStudents(
    groupId: string,
    templateId: string,
    threshold = 70,
  ): Promise<SendNotificationResponse> {
    const lowPerformance = await this.getLowPerformanceStudents(groupId, threshold);
    const studentIds = lowPerformance.map((s) => s.id);

    return this.sendNotification({
      group_id: groupId,
      template_id: templateId,
      student_ids: studentIds,
    });
  }
}

/**
 * Фабрика для создания TeacherApi с существующим ApiClient
 */
export function createTeacherApi(client: ApiClient): TeacherApi {
  return new TeacherApi(client);
}
