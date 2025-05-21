
import { WHATSAPP_NUMBER_STORAGE_KEY } from '../constants';

export const saveWhatsAppNumber = (phoneNumber: string): void => {
  try {
    localStorage.setItem(WHATSAPP_NUMBER_STORAGE_KEY, phoneNumber);
  } catch (error) {
    console.error("Error saving WhatsApp number to localStorage:", error);
    // Optionally, notify the user or handle the error gracefully
  }
};

export const getStoredWhatsAppNumber = (): string | null => {
  try {
    return localStorage.getItem(WHATSAPP_NUMBER_STORAGE_KEY);
  } catch (error) {
    console.error("Error retrieving WhatsApp number from localStorage:", error);
    return null;
  }
};

export const removeWhatsAppNumber = (): void => {
  try {
    localStorage.removeItem(WHATSAPP_NUMBER_STORAGE_KEY);
  } catch (error) {
    console.error("Error removing WhatsApp number from localStorage:", error);
  }
};
    