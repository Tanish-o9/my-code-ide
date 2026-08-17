import { Request, Response } from 'express';
import { InstalledExtension, ExtensionListing } from './extension.model';
import { ExtensionHostService } from './extension-host.service';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';

export class ExtensionController {
  
  /**
   * Fetch all installed extensions.
   */
  public static async getInstalledExtensions(req: Request, res: Response): Promise<void> {
    try {
      const installed = await InstalledExtension.find();
      res.json(installed);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch installed extensions.' });
    }
  }

  /**
   * Install a published extension.
   */
  public static async installExtension(req: Request, res: Response): Promise<void> {
    try {
      const { extensionId } = req.body;
      const listing = await ExtensionListing.findOne({ extensionId, reviewStatus: 'approved' });
      if (!listing) {
        res.status(404).json({ error: 'Approved extension not found in marketplace.' });
        return;
      }

      // Check if already installed
      let installed = await InstalledExtension.findOne({ extensionId });
      if (installed) {
        res.status(400).json({ error: 'Extension is already installed.' });
        return;
      }

      // Create installation entry
      installed = new InstalledExtension({
        extensionId,
        manifest: listing.versions[listing.versions.length - 1].manifest,
        active: true,
        settings: {}
      });
      await installed.save();

      // Increment download counter
      listing.downloadCount += 1;
      await listing.save();

      res.status(201).json(installed);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to install extension.' });
    }
  }

  /**
   * Enable/Disable an extension.
   */
  public static async toggleExtension(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { active, workspaceId } = req.body; // Toggle status and current active workspace context

      const ext = await InstalledExtension.findById(id);
      if (!ext) {
        res.status(404).json({ error: 'Extension not found.' });
        return;
      }

      ext.active = active;
      await ext.save();

      // Trigger lifecycle actions
      if (active) {
        // Trigger lazy activation on workspace open or command trigger
        if (workspaceId) {
          await ExtensionHostService.activateByEvent(workspaceId, 'onWorkspaceOpen');
        }
      } else {
        if (workspaceId) {
          ExtensionHostService.stopHost(ext.extensionId, workspaceId);
        }
      }

      res.json(ext);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to toggle extension.' });
    }
  }

  /**
   * Uninstall an extension.
   */
  public static async uninstallExtension(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { workspaceId } = req.body;

      const ext = await InstalledExtension.findById(id);
      if (!ext) {
        res.status(404).json({ error: 'Extension not found.' });
        return;
      }

      // Stop running process if active
      if (workspaceId) {
        ExtensionHostService.stopHost(ext.extensionId, workspaceId);
      }

      await InstalledExtension.findByIdAndDelete(id);
      res.json({ success: true, message: 'Extension uninstalled successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to uninstall extension.' });
    }
  }

  /**
   * Search published extensions in the marketplace.
   */
  public static async getMarketplaceListings(req: Request, res: Response): Promise<void> {
    try {
      const { search } = req.query;
      const query: any = { reviewStatus: 'approved' };
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { publisher: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const listings = await ExtensionListing.find(query);
      res.json(listings);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to search marketplace.' });
    }
  }

  /**
   * Publish an extension with automated static security gates (Module 103).
   */
  public static async publishExtension(req: Request, res: Response): Promise<void> {
    try {
      const { manifest, code } = req.body; // Send manifest metadata and raw script text

      if (!manifest || !manifest.name || !manifest.version || !manifest.publisher) {
        res.status(400).json({ error: 'Malformed manifest parameters.' });
        return;
      }

      // Perform Automated Static Checks (Module 103)
      let needsManualReview = false;
      const permissions = manifest.permissions || [];

      // 1. Broad permission combinations (e.g. file:write + network, or wildcard *)
      const hasWrite = permissions.includes('file:write');
      const hasWildcard = permissions.includes('*');
      if (hasWildcard || (hasWrite && permissions.some((p: string) => p.includes('network')))) {
        needsManualReview = true;
        console.warn(`[AutomatedReview] Flagged suspicious permission combination for: ${manifest.publisher}.${manifest.name}`);
      }

      // 2. Scan code for malware/suspicious patterns (e.g. child_process.exec, eval, system commands)
      if (code && typeof code === 'string') {
        const suspiciousPatterns = [/eval\(/, /child_process/, /exec\(/, /spawn\(/, /process\.exit/];
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(code)) {
            needsManualReview = true;
            console.warn(`[AutomatedReview] Suspicious code signature found matching pattern: ${pattern}`);
            break;
          }
        }
      }

      // Write mock entry file to local folder
      const extensionId = `${manifest.publisher}.${manifest.name}`;
      const extDir = path.resolve(__dirname, '../../extensions', extensionId);
      if (!fs.existsSync(extDir)) {
        fs.mkdirSync(extDir, { recursive: true });
      }

      const entryPath = path.join(extDir, manifest.entryPath || 'index.js');
      fs.writeFileSync(entryPath, code || '// Mock compiled extension source\n');

      // Update or create Listing in DB
      let listing = await ExtensionListing.findOne({ extensionId });
      
      const newVersion = {
        version: manifest.version,
        entryPath,
        manifest,
        createdAt: new Date()
      };

      const reviewStatus = needsManualReview ? 'pending' : 'approved';

      if (listing) {
        listing.latestVersion = manifest.version;
        listing.versions.push(newVersion);
        listing.reviewStatus = reviewStatus;
      } else {
        listing = new ExtensionListing({
          extensionId,
          name: manifest.name,
          publisher: manifest.publisher,
          description: manifest.description || '',
          latestVersion: manifest.version,
          versions: [newVersion],
          reviewStatus
        });
      }

      await listing.save();

      res.status(201).json({
        success: true,
        listing,
        requiresManualReview: needsManualReview
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to publish extension.' });
    }
  }

  /**
   * Update Namespaced Extension Settings (Module 100).
   */
  public static async updateExtensionSettings(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { settings } = req.body;

      const ext = await InstalledExtension.findById(id);
      if (!ext) {
        res.status(404).json({ error: 'Extension not found.' });
        return;
      }

      // Merge and save settings
      ext.settings = { ...ext.settings, ...settings };
      await ext.save();

      // Trigger settings change RPC notification to the extension host if running
      const host = (ExtensionHostService as any).activeHosts.get(ext.extensionId);
      if (host) {
        host.send({ type: 'event', event: 'onDidChangeConfiguration', body: { settings: ext.settings } });
      }

      res.json(ext);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update configuration.' });
    }
  }

  /**
   * Install/Update extension from a VSIX file upload.
   */
  public static async installVsix(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No VSIX file uploaded.' });
        return;
      }

      const zip = new AdmZip(req.file.buffer);
      const zipEntries = zip.getEntries();

      const packageJsonEntry = zipEntries.find(
        (entry) => entry.entryName.replace(/\\/g, '/') === 'extension/package.json'
      );

      if (!packageJsonEntry) {
        res.status(400).json({ error: 'Invalid VSIX: package.json not found in extension/ folder.' });
        return;
      }

      const manifestContent = packageJsonEntry.getData().toString('utf8');
      const manifest = JSON.parse(manifestContent);

      if (!manifest.name || !manifest.version || !manifest.publisher) {
        res.status(400).json({ error: 'VSIX package.json is missing name, version, or publisher.' });
        return;
      }

      const extensionId = `${manifest.publisher}.${manifest.name}`;
      const extDir = path.resolve(__dirname, '../../extensions', extensionId);

      if (fs.existsSync(extDir)) {
        fs.rmSync(extDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extDir, { recursive: true });

      zipEntries.forEach((entry) => {
        const entryPath = entry.entryName.replace(/\\/g, '/');
        if (entryPath.startsWith('extension/') && entryPath !== 'extension/') {
          const relativePart = entryPath.substring('extension/'.length);
          const targetPath = path.join(extDir, relativePart);
          
          if (entry.isDirectory) {
            fs.mkdirSync(targetPath, { recursive: true });
          } else {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, entry.getData());
          }
        }
      });

      let installed = await InstalledExtension.findOne({ extensionId });
      const entryPath = path.join(extDir, manifest.main || 'index.js');

      const manifestData = {
        name: manifest.name,
        version: manifest.version,
        publisher: manifest.publisher,
        description: manifest.description || '',
        activationEvents: manifest.activationEvents || [],
        permissions: manifest.permissions || [],
        settingsSchema: manifest.contributes?.configuration?.properties || {},
        entryPath
      };

      if (installed) {
        installed.manifest = manifestData;
        installed.active = true;
      } else {
        installed = new InstalledExtension({
          extensionId,
          manifest: manifestData,
          active: true,
          settings: {}
        });
      }

      await installed.save();

      res.status(201).json({
        success: true,
        message: `VSIX extension '${extensionId}' installed successfully.`,
        installed
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'VSIX installation failed.' });
    }
  }

  /**
   * Submit/update rating for a marketplace extension.
   */
  public static async rateExtension(req: Request, res: Response): Promise<void> {
    try {
      const { extensionId, rating } = req.body;
      if (!extensionId || typeof rating !== 'number' || rating < 1 || rating > 5) {
        res.status(400).json({ error: 'extensionId and a valid rating (1-5) are required.' });
        return;
      }

      const listing = await ExtensionListing.findOne({ extensionId });
      if (!listing) {
        res.status(404).json({ error: 'Marketplace extension not found.' });
        return;
      }

      const totalRatings = listing.ratingCount;
      const currentSum = listing.rating * totalRatings;
      const newCount = totalRatings + 1;
      const newAverage = parseFloat(((currentSum + rating) / newCount).toFixed(2));

      listing.rating = newAverage;
      listing.ratingCount = newCount;
      await listing.save();

      res.json({ success: true, rating: listing.rating, ratingCount: listing.ratingCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to submit rating.' });
    }
  }
}
