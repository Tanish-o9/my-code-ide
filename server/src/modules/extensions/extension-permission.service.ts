import { InstalledExtension } from './extension.model';

export class ExtensionPermissionService {
  /**
   * Checks if a given extension has been granted the required capability permission.
   * If the extension is not registered or disabled, permission is implicitly denied.
   */
  public static async hasPermission(extensionId: string, permission: string): Promise<boolean> {
    const ext = await InstalledExtension.findOne({ extensionId });
    if (!ext) {
      console.warn(`[PermissionService] Extension ${extensionId} not installed.`);
      return false;
    }

    if (!ext.active) {
      console.warn(`[PermissionService] Extension ${extensionId} is disabled.`);
      return false;
    }

    const permissions = ext.manifest.permissions || [];
    // Wildcard permissions support or exact match
    const granted = permissions.includes('*') || permissions.includes(permission);
    if (!granted) {
      console.error(`[PermissionService] Extension ${extensionId} denied permission: ${permission}`);
    }
    return granted;
  }
}
