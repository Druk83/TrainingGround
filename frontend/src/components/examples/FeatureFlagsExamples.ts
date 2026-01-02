/**
 * Example Vue components using Feature Flags
 *
 * These components demonstrate how to conditionally render UI based on feature flags.
 */

/**
 * TaskCard.vue - Component that conditionally shows hint button based on flag
 */
export const TaskCardExample = `
<template>
  <div class="task-card">
    <div class="task-content">
      <h3>{{ task.title }}</h3>
      <p>{{ task.description }}</p>
    </div>

    <div class="task-actions">
      <!-- Show submit button (always available) -->
      <button @click="submit" class="btn btn-primary">
        Submit Answer
      </button>

      <!-- Conditionally show hint button based on flag -->
      <button
        v-if="isEnabled('hints_enabled')"
        @click="requestHint"
        class="btn btn-secondary"
        :disabled="hintsRemaining === 0"
      >
        Get Hint ({{ hintsRemaining }}/{{ maxHints }})
      </button>
      <p v-else class="text-muted">
        Hints are currently disabled
      </p>
    </div>

    <!-- Show hint if available -->
    <div v-if="currentHint && isEnabled('hints_enabled')" class="hint-box">
      <strong>Hint:</strong> {{ currentHint }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFeatureFlags } from '@/services/featureFlags';

const { isEnabled, getConfig } = useFeatureFlags();

const props = defineProps({
  task: {
    type: Object,
    required: true,
  },
});

// Get flag configuration
const hintConfig = computed(() => getConfig('hints_enabled'));
const maxHints = computed(() => hintConfig.value?.max_hints_per_task ?? 3);

const hintsRemaining = ref(3);
const currentHint = ref<string | null>(null);

const requestHint = async () => {
  if (hintsRemaining.value > 0) {
    // Call hint API
    currentHint.value = 'This is a hint!';
    hintsRemaining.value--;
  }
};

const submit = () => {
  // Submit answer
};
</script>
`;

/**
 * LeaderboardPanel.vue - Component that shows/hides based on flag
 */
export const LeaderboardPanelExample = `
<template>
  <div v-if="isEnabled('leaderboard_enabled')" class="leaderboard-panel">
    <h2>Leaderboard</h2>
    <div class="leaderboard-content">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>User</th>
            <th>Score</th>
            <th>Accuracy</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(user, index) in leaderboard" :key="user.id">
            <td>{{ index + 1 }}</td>
            <td>{{ user.name }}</td>
            <td>{{ user.score }}</td>
            <td>{{ user.accuracy }}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else class="leaderboard-disabled">
    <p>Leaderboard is currently unavailable</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useFeatureFlags } from '@/services/featureFlags';

const { isEnabled, getConfig } = useFeatureFlags();

const leaderboard = ref([]);

const loadLeaderboard = async () => {
  if (!isEnabled('leaderboard_enabled')) {
    return;
  }

  const config = getConfig('leaderboard_enabled');
  const topN = config?.top_n ?? 100;

  // Fetch leaderboard data
  const response = await fetch('/api/leaderboard?limit=' + topN);
  leaderboard.value = await response.json();
};

onMounted(() => {
  loadLeaderboard();
});
</script>
`;

/**
 * ExplanationPanel.vue - Component with fallback logic based on flags
 */
export const ExplanationPanelExample = `
<template>
  <div v-if="isEnabled('explanation_api_enabled')" class="explanation-panel">
    <div v-if="loading" class="spinner">Loading explanation...</div>

    <div v-else-if="explanation" class="explanation-content">
      <h3>Explanation</h3>
      <div class="explanation-text">{{ explanation }}</div>
      
      <p v-if="isEnabled('explanation_yandexgpt_enabled')" class="badge">
        Generated with AI
      </p>
      <p v-else class="badge">
        Template-based explanation
      </p>
    </div>

    <div v-else class="no-explanation">
      No explanation available
    </div>
  </div>

  <div v-else class="explanation-disabled">
    <p>Explanations are currently unavailable</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useFeatureFlags } from '@/services/featureFlags';

const { isEnabled } = useFeatureFlags();

const props = defineProps({
  taskId: {
    type: String,
    required: true,
  },
  userAnswer: {
    type: String,
    required: true,
  },
});

const loading = ref(false);
const explanation = ref<string | null>(null);

const loadExplanation = async () => {
  if (!isEnabled('explanation_api_enabled')) {
    return;
  }

  loading.value = true;
  try {
    const response = await fetch('/api/explanations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: props.taskId,
        user_answer: props.userAnswer,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      explanation.value = data.explanation;
    }
  } catch (error) {
    console.error('Failed to load explanation:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadExplanation();
});
</script>
`;

/**
 * AntiCheatWarning.vue - Component that shows strict mode warning
 */
export const AntiCheatWarningExample = `
<template>
  <div v-if="isEnabled('anticheat_strict_mode')" class="anticheat-warning">
    <div class="warning-icon">⚠️</div>
    <div class="warning-content">
      <h4>Anti-cheat Mode Active</h4>
      <p>{{ warningMessage }}</p>
      <ul>
        <li>Don't switch tabs or windows</li>
        <li>Take your time - speed doesn't matter</li>
        <li>Use only allowed resources</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFeatureFlags } from '@/services/featureFlags';

const { isEnabled, getConfig } = useFeatureFlags();

const anticheatConfig = computed(() => getConfig('anticheat_strict_mode'));

const warningMessage = computed(() => {
  const config = anticheatConfig.value;
  const tabThreshold = config?.tab_switch_threshold ?? 3;
  
  return \`This session is monitored for suspicious activity. \
Excessive tab switches (>\${tabThreshold}) may result in incident reporting.\`;
});
</script>
`;

/**
 * AdminFlagManager.vue - Admin panel for managing flags
 */
export const AdminFlagManagerExample = `
<template>
  <div class="admin-flag-manager">
    <h2>Feature Flags Management</h2>

    <div class="flag-list">
      <div v-for="flag in flags" :key="flag.flag_key" class="flag-item">
        <div class="flag-header">
          <h3>{{ flag.flag_key }}</h3>
          <toggle-switch
            v-model="flag.enabled"
            @change="updateFlag(flag)"
          />
        </div>

        <p class="flag-description">{{ flag.description }}</p>

        <div class="flag-details">
          <div class="detail-field">
            <label>Scope:</label>
            <select v-model="flag.scope" @change="updateFlag(flag)">
              <option value="global">Global</option>
              <option value="group">Group</option>
              <option value="user">User</option>
            </select>
          </div>

          <div v-if="flag.scope !== 'global'" class="detail-field">
            <label>Target IDs:</label>
            <input
              v-model="targetIdsInput[flag.flag_key]"
              type="text"
              placeholder="Comma-separated IDs"
              @blur="updateFlag(flag)"
            />
          </div>

          <div class="detail-field">
            <label>Reason for change:</label>
            <input
              v-model="changeReasons[flag.flag_key]"
              type="text"
              placeholder="Why are you making this change?"
            />
          </div>
        </div>

        <button
          @click="saveFlag(flag)"
          class="btn btn-primary"
          :disabled="!hasChanges(flag)"
        >
          Save Changes
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useFeatureFlags } from '@/services/featureFlags';

const flags = ref([]);
const targetIdsInput = ref({});
const changeReasons = ref({});

const loadFlags = async () => {
  const response = await fetch('/admin/feature-flags', {
    headers: {
      Authorization: \`Bearer \${localStorage.getItem('jwt_token')}\`,
    },
  });
  flags.value = await response.json();
};

const saveFlag = async (flag) => {
  const response = await fetch(\`/admin/feature-flags/\${flag.flag_key}\`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${localStorage.getItem('jwt_token')}\`,
    },
    body: JSON.stringify({
      enabled: flag.enabled,
      scope: flag.scope,
      target_ids: targetIdsInput.value[flag.flag_key]?.split(',').map(s => s.trim()) ?? [],
      change_reason: changeReasons.value[flag.flag_key] || 'No reason provided',
      config: flag.config,
    }),
  });

  if (response.ok) {
    alert('Flag updated successfully!');
  } else {
    alert('Failed to update flag');
  }
};

const updateFlag = (flag) => {
  // Local update logic
};

const hasChanges = (flag) => {
  // Check if flag has unsaved changes
  return true;
};

onMounted(() => {
  loadFlags();
});
</script>
`;

export const componentExamples = {
  TaskCard: TaskCardExample,
  LeaderboardPanel: LeaderboardPanelExample,
  ExplanationPanel: ExplanationPanelExample,
  AntiCheatWarning: AntiCheatWarningExample,
  AdminFlagManager: AdminFlagManagerExample,
};
