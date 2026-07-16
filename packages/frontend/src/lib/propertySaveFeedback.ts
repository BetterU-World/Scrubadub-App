import { toFriendlyMessage } from "./friendlyError";

type PropertySaveFeedback = {
  success: (message: string) => void;
  error: (message: string) => void;
};

export async function runPropertySave<T>(
  mutation: () => Promise<T>,
  feedback: PropertySaveFeedback,
  successMessage: string,
  errorFallback: string,
): Promise<T> {
  try {
    const result = await mutation();
    feedback.success(successMessage);
    return result;
  } catch (error) {
    console.error("Property save failed", error);
    feedback.error(toFriendlyMessage(error, errorFallback));
    throw error;
  }
}
