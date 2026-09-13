import { settingsService } from "../../core/services/settingsService";
import {
  AppSettings,
  UpdateAppSettingsInput,
  UpdateAutoBackupSettingsInput,
  UpdateCloudBackupSettingsInput,
  UpdateNotificationSettingsInput,
  UpdateProjectInfoInput,
  UpdateQuickCheckInSettingsInput,
  UpdateQuickBreakSettingsInput,
} from "../../entities/AppSettings";

export const settingsApi = {
  async get(): Promise<AppSettings> {
    return settingsService.get();
  },

  async update(input: UpdateAppSettingsInput): Promise<AppSettings> {
    return settingsService.update(input);
  },

  async updateAutoBackupSettings(input: UpdateAutoBackupSettingsInput): Promise<AppSettings> {
    return settingsService.updateAutoBackupSettings(input);
  },

  async updateCloudBackupSettings(input: UpdateCloudBackupSettingsInput): Promise<AppSettings> {
    return settingsService.updateCloudBackupSettings(input);
  },

  async updateNotificationSettings(input: UpdateNotificationSettingsInput): Promise<AppSettings> {
    return settingsService.updateNotificationSettings(input);
  },

  async updateProjectInfo(input: UpdateProjectInfoInput): Promise<AppSettings> {
    return settingsService.updateProjectInfo(input);
  },

  async updateQuickCheckInSettings(input: UpdateQuickCheckInSettingsInput): Promise<AppSettings> {
    return settingsService.updateQuickCheckInSettings(input);
  },

  async updateQuickBreakSettings(input: UpdateQuickBreakSettingsInput): Promise<AppSettings> {
    return settingsService.updateQuickBreakSettings(input);
  },
};
