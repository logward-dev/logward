import { db } from '../../database/connection.js';
import type { ChecklistItemsState } from '../../database/types.js';

export interface OnboardingState {
  checklistItems: ChecklistItemsState;
  checklistCollapsed: boolean;
  checklistDismissed: boolean;
  tutorialCompleted: boolean;
  tutorialStep: number;
  tutorialSkipped: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  checklistItems: {},
  checklistCollapsed: false,
  checklistDismissed: false,
  tutorialCompleted: false,
  tutorialStep: 0,
  tutorialSkipped: false,
};

class OnboardingService {
  /**
   * Get onboarding state for a user
   * Creates a new record if one doesn't exist
   */
  async getOnboardingState(userId: string): Promise<OnboardingState> {
    // Try to get existing state
    const existing = await db
      .selectFrom('user_onboarding')
      .select([
        'checklist_items',
        'checklist_collapsed',
        'checklist_dismissed',
        'tutorial_completed',
        'tutorial_step',
        'tutorial_skipped',
      ])
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (existing) {
      return {
        checklistItems: existing.checklist_items,
        checklistCollapsed: existing.checklist_collapsed,
        checklistDismissed: existing.checklist_dismissed,
        tutorialCompleted: existing.tutorial_completed,
        tutorialStep: existing.tutorial_step,
        tutorialSkipped: existing.tutorial_skipped,
      };
    }

    // Create new record with defaults
    await db
      .insertInto('user_onboarding')
      .values({
        user_id: userId,
        checklist_items: {},
        checklist_collapsed: false,
        checklist_dismissed: false,
        tutorial_completed: false,
        tutorial_step: 0,
        tutorial_skipped: false,
      })
      .execute();

    return DEFAULT_STATE;
  }

  /**
   * Update onboarding state for a user
   */
  async updateOnboardingState(
    userId: string,
    updates: Partial<OnboardingState>
  ): Promise<OnboardingState> {
    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.checklistItems !== undefined) {
      updateData.checklist_items = updates.checklistItems;
    }
    if (updates.checklistCollapsed !== undefined) {
      updateData.checklist_collapsed = updates.checklistCollapsed;
    }
    if (updates.checklistDismissed !== undefined) {
      updateData.checklist_dismissed = updates.checklistDismissed;
    }
    if (updates.tutorialCompleted !== undefined) {
      updateData.tutorial_completed = updates.tutorialCompleted;
    }
    if (updates.tutorialStep !== undefined) {
      updateData.tutorial_step = updates.tutorialStep;
    }
    if (updates.tutorialSkipped !== undefined) {
      updateData.tutorial_skipped = updates.tutorialSkipped;
    }

    // Upsert: update if exists, insert if not
    const existing = await db
      .selectFrom('user_onboarding')
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('user_onboarding')
        .set(updateData)
        .where('user_id', '=', userId)
        .execute();
    } else {
      await db
        .insertInto('user_onboarding')
        .values({
          user_id: userId,
          checklist_items: updates.checklistItems ?? {},
          checklist_collapsed: updates.checklistCollapsed ?? false,
          checklist_dismissed: updates.checklistDismissed ?? false,
          tutorial_completed: updates.tutorialCompleted ?? false,
          tutorial_step: updates.tutorialStep ?? 0,
          tutorial_skipped: updates.tutorialSkipped ?? false,
        })
        .execute();
    }

    return this.getOnboardingState(userId);
  }

  /**
   * Mark a checklist item as completed
   */
  async completeChecklistItem(userId: string, itemId: string): Promise<OnboardingState> {
    const currentState = await this.getOnboardingState(userId);
    const newItems = { ...currentState.checklistItems, [itemId]: true };

    return this.updateOnboardingState(userId, { checklistItems: newItems });
  }

  /**
   * Reset onboarding state for a user
   */
  async resetOnboardingState(userId: string): Promise<OnboardingState> {
    await db
      .deleteFrom('user_onboarding')
      .where('user_id', '=', userId)
      .execute();

    return this.getOnboardingState(userId);
  }
}

export const onboardingService = new OnboardingService();
