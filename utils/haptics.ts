import * as Haptics from 'expo-haptics';

/** Heavy mechanical tap when the Air Jet button is first pressed. */
export function hapticJetPress() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/** Soft repeating tick while the Air Jet button is held down. */
export function hapticJetHoldTick() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Sharp "thunk" when an object settles cleanly into a target. */
export function hapticLanding() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Multi-pulse celebration sequence on level completion. */
export async function hapticLevelComplete() {
  const pattern = [
    Haptics.ImpactFeedbackStyle.Medium,
    Haptics.ImpactFeedbackStyle.Medium,
    Haptics.ImpactFeedbackStyle.Heavy,
  ];
  for (const style of pattern) {
    await Haptics.impactAsync(style);
    await new Promise((resolve) => setTimeout(resolve, 90));
  }
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
