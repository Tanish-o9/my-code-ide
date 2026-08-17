import { Request, Response } from 'express';
import crypto from 'crypto';
import { WorkspaceInvite } from './invite.model';
import { Workspace } from '../workspaces/workspace.model';
import { User } from '../users/user.model';
import { sendMail } from '../../utils/mailer';
import { WorkspaceRequest } from '../../middleware/workspace-auth.middleware';

/**
 * Sends a workspace invitation to an email address.
 */
export const createInvite = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { email, role } = req.body;
    const workspaceId = req.params.workspaceId;

    if (!email || !role) {
      res.status(400).json({ error: 'Email and role are required' });
      return;
    }

    const emailClean = email.toLowerCase().trim();
    const workspace = req.workspace;
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    // 1. Check if the owner is being invited
    const owner = await User.findById(workspace.ownerId);
    if (owner && owner.email.toLowerCase() === emailClean) {
      res.status(400).json({ error: 'Owner cannot be invited as a collaborator' });
      return;
    }

    // 2. Check if the invited email is already a collaborator
    const invitedUser = await User.findOne({ email: emailClean });
    if (invitedUser) {
      const existingCollab = workspace.collaborators.find(
        (c) => c.userId.toString() === invitedUser._id.toString()
      );

      if (existingCollab) {
        // If already collaborator, update role directly (Module 46 rule)
        existingCollab.role = role;
        await workspace.save();
        res.status(200).json({ message: 'Collaborator role updated successfully', role });
        return;
      }
    }

    // 3. Generate secure accept token and 24h expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 4. Create or update pending invite
    let invite = await WorkspaceInvite.findOne({ workspaceId, email: emailClean, status: 'pending' });
    if (invite) {
      invite.role = role;
      invite.token = token;
      invite.expiry = expiry;
      await invite.save();
    } else {
      invite = await WorkspaceInvite.create({
        workspaceId,
        email: emailClean,
        role,
        token,
        expiry,
        status: 'pending',
      });
    }

    // 5. Send Transactional Invite Link
    const acceptLink = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/accept-invite/${token}`;
    const emailSubject = `Invitation to collaborate on Workspace: ${workspace.name}`;
    const emailBody = `
      <h3>You've been invited!</h3>
      <p>You have been invited to join the workspace <strong>${workspace.name}</strong> as an <strong>${role}</strong>.</p>
      <p>Click the link below to accept the invitation:</p>
      <a href="${acceptLink}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:white;text-decoration:none;border-radius:4px;">Accept Invitation</a>
      <p>This link will expire in 24 hours.</p>
    `;

    // Fire and forget sendMail
    sendMail({ to: emailClean, subject: emailSubject, html: emailBody }).catch((err) => {
      console.error('[Mailer/Invite] Failed to send email:', err);
    });

    // Mirroring login security: always return the same response shape
    res.status(200).json({
      message: 'Invitation sent successfully',
      token, // Return token locally for testing convenience
    });
  } catch (err: any) {
    console.error('[Invite/Create] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Gets details of a specific invitation token.
 */
export const getInviteDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    const invite = await WorkspaceInvite.findOne({ token });
    if (!invite) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    if (invite.status !== 'pending' || invite.expiry < new Date()) {
      invite.status = invite.status === 'pending' ? 'expired' : invite.status;
      await invite.save();
      res.status(400).json({ error: 'Invitation is expired or already accepted' });
      return;
    }

    const workspace = await Workspace.findById(invite.workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace no longer exists' });
      return;
    }

    res.status(200).json({
      email: invite.email,
      role: invite.role,
      workspaceName: workspace.name,
      workspaceId: workspace._id,
    });
  } catch (err: any) {
    console.error('[Invite/Details] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Accepts a workspace invitation for a logged-in user.
 */
export const acceptInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const userId = (req as any).user?.userId;
    const userEmail = (req as any).user?.email?.toLowerCase()?.trim();

    if (!userId || !userEmail) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const invite = await WorkspaceInvite.findOne({ token });
    if (!invite) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    if (invite.status !== 'pending' || invite.expiry < new Date()) {
      invite.status = invite.status === 'pending' ? 'expired' : invite.status;
      await invite.save();
      res.status(400).json({ error: 'Invitation is expired or already accepted' });
      return;
    }

    // Verify recipient email alignment
    if (invite.email.toLowerCase() !== userEmail) {
      res.status(403).json({ error: 'This invitation was sent to a different email address' });
      return;
    }

    const workspace = await Workspace.findById(invite.workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace no longer exists' });
      return;
    }

    // Verify if already present
    const isCollab = workspace.collaborators.some((c) => c.userId.toString() === userId);
    if (!isCollab) {
      workspace.collaborators.push({
        userId,
        role: invite.role,
      });
      await workspace.save();
    }

    // Expire token immediately on first successful accept
    invite.status = 'accepted';
    await invite.save();

    res.status(200).json({ message: 'Invitation accepted successfully', workspaceId: workspace._id });
  } catch (err: any) {
    console.error('[Invite/Accept] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
