import { expect, test, type Page } from '@playwright/test';

const adminProfile = {
  id: 'admin-e2e',
  email: 'admin@test.com',
  name: 'E2E Admin',
  role: 'admin',
  group_ids: [],
  created_at: new Date().toISOString(),
};

function seedAdminProfile(page: Page) {
  return page.addInitScript((user: typeof adminProfile) => {
    try {
      window.localStorage.setItem('access_token', 'e2e-admin-token');
      window.localStorage.setItem('user', JSON.stringify(user));
    } catch (error) {
      console.warn('Failed to seed admin user', error);
    }
  }, adminProfile);
}

test.describe('Admin CRUD Flows', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminProfile(page);
    page.on('console', (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`);
    });
  });

  test('admin can list and create users from UI', async ({ page }) => {
    await page.route('**/admin/groups**', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    const mockUsers = [
      {
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice Example',
        role: 'teacher',
        group_ids: [],
        is_blocked: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'user-2',
        email: 'bob@example.com',
        name: 'Bob Example',
        role: 'student',
        group_ids: [],
        is_blocked: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const getCalls: string[] = [];
    const createPayloads: any[] = [];

    await page.route('**/admin/users**', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue();
        return;
      }

      const method = route.request().method();
      if (method === 'GET') {
        getCalls.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUsers),
        });
        return;
      }
      if (method === 'POST') {
        const payload = JSON.parse(route.request().postData() ?? '{}');
        createPayloads.push(payload);
        const newUser = {
          id: `user-${Date.now()}`,
          email: payload.email,
          name: payload.name,
          role: payload.role,
          group_ids: [],
          is_blocked: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockUsers.push(newUser);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newUser),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUsers),
      });
    });

    await page.goto('/admin/users');
    console.log('navigated to', await page.url());
    await page.waitForSelector('users-management');
    await expect.poll(() => getCalls.length).toBeGreaterThan(0);

    const usersComponent = page.locator('users-management');
    await usersComponent.getByRole('button', { name: 'Создать пользователя' }).click();
    const newEmail = `playwright-${Date.now()}@example.com`;
    await usersComponent.locator('input[name="email"]').fill(newEmail);
    await usersComponent.locator('input[name="password"]').fill('TestPassword123!');
    await usersComponent.locator('input[name="name"]').fill('Playwright Admin');
    await usersComponent.locator('select[name="role"]').selectOption('teacher');
    const createModal = usersComponent.locator('.modal.open');
    await createModal.getByRole('button', { name: 'Создать', exact: true }).click();

    await expect.poll(() => createPayloads.length).toBe(1);
    expect(createPayloads[0].email).toContain('playwright-');
    await expect.poll(() => getCalls.length).toBeGreaterThan(1);
  });

  test('admin can create groups and view list', async ({ page }) => {
    const mockGroups = [
      {
        id: 'group-1',
        name: 'Alpha',
        school: 'School X',
        curator_id: null,
        curator_name: null,
        description: null,
        student_count: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const groupGetCalls: string[] = [];
    const groupCreatePayloads: any[] = [];

    await page.route('**/admin/groups**', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.continue();
        return;
      }

      const method = route.request().method();
      if (method === 'GET') {
        groupGetCalls.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockGroups),
        });
        return;
      }

      if (method === 'POST') {
        const payload = JSON.parse(route.request().postData() ?? '{}');
        groupCreatePayloads.push(payload);
        const newGroup = {
          id: `group-${Date.now()}`,
          name: payload.name,
          school: payload.school,
          curator_id: null,
          curator_name: null,
          description: payload.description ?? null,
          student_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockGroups.push(newGroup);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newGroup),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/admin/groups');
    console.log('groups url', await page.url());
    await page.waitForSelector('groups-management');
    await expect.poll(() => groupGetCalls.length).toBeGreaterThan(0);

    const groupsComponent = page.locator('groups-management');
    await groupsComponent.getByRole('button', { name: 'Создать группу' }).click();
    const groupName = `Playwright ${Date.now()}`;
    await groupsComponent.locator('input[name="name"]').fill(groupName);
    await groupsComponent.locator('input[name="school"]').fill('Test School');
    await groupsComponent.locator('textarea[name="description"]').fill('E2E description');
    const groupModal = groupsComponent.locator('.modal.open');
    await groupModal.getByRole('button', { name: 'Создать', exact: true }).click();

    await expect.poll(() => groupCreatePayloads.length).toBe(1);
    expect(groupCreatePayloads[0].name).toContain('Playwright');
    await expect.poll(() => groupGetCalls.length).toBeGreaterThan(1);
  });
});
