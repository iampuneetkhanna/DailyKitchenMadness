
export interface UserSettings {
  whatsAppNumber: string;
}

export enum RecordingState {
  IDLE = "IDLE",
  REQUESTING_PERMISSION = "REQUESTING_PERMISSION",
  LISTENING = "LISTENING",
  PROCESSING = "PROCESSING",
  SHOWING_LIST = "SHOWING_LIST",
  ERROR = "ERROR",
}

export interface GroceryItem {
  id: string;
  name: string;
}
    