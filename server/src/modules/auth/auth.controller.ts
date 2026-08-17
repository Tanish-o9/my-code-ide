import { Request, Response } from 'express';
import { User } from '../users/user.model';
import { RefreshToken } from './refresh-token.model';
import { WorkspaceInvite } from '../invites/invite.model';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken, 
  hashToken 
} from '../../lib/jwt';
import { config } from '../../config';

const COOKIE_NAME = 'refreshToken';

const setRefreshTokenCookie = (res: Response, token: string) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, inviteToken } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required' });
      return;
    }

    const emailClean = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: emailClean });
    if (existingUser) {
      res.status(400).json({ error: 'Email is already registered' });
      return;
    }

    // Validate inviteToken before creating user
    let inviteValid = false;
    let workspaceId = null;
    let inviteRole: 'viewer' | 'editor' | 'admin' = 'editor';

    if (inviteToken) {
      const invite = await WorkspaceInvite.findOne({ token: inviteToken, status: 'pending' });
      if (invite && invite.expiry > new Date() && invite.email.toLowerCase() === emailClean) {
        inviteValid = true;
        workspaceId = invite.workspaceId;
        inviteRole = invite.role;
      }
    }

    const user = new User({
      name,
      email: emailClean,
      passwordHash: password, // Pre-save hook hashes this
    });

    await user.save();

    // Auto-accept invite on successful registration
    if (inviteValid && workspaceId) {
      const { Workspace } = require('../workspaces/workspace.model');
      const workspace = await Workspace.findById(workspaceId);
      if (workspace) {
        const isCollab = workspace.collaborators.some((c: any) => c.userId.toString() === user.id);
        if (!isCollab) {
          workspace.collaborators.push({ userId: user._id, role: inviteRole });
          await workspace.save();
        }
      }
      await WorkspaceInvite.updateOne({ token: inviteToken }, { status: 'accepted' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    const tokenHash = hashToken(refreshToken);

    // Save refresh token hash
    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshTokenCookie(res, refreshToken);

    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      theme_preference: user.theme_preference,
      createdAt: user.createdAt,
    };

    res.status(201).json({
      user: userResponse,
      accessToken,
    });
  } catch (error: any) {
    console.error('[Auth/Register] Error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Explicitly select passwordHash since it's select: false
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // SSO enforcement check: if user belongs to an org enforcing SSO, reject password logins
    try {
      const { OrganizationMembership, OrgSSOConfig } = require('../workspaces/organization.model');
      const memberships = await OrganizationMembership.find({ user: user._id });
      const orgIds = memberships.map((m: any) => m.organization);
      if (orgIds.length > 0) {
        const enforcingSSOConfig = await OrgSSOConfig.findOne({
          organizationId: { $in: orgIds },
          enforce_sso: true,
          sso_enabled: true
        });
        if (enforcingSSOConfig) {
          res.status(403).json({ error: 'SSO is enforced for your organization. Please sign in via Enterprise SSO.' });
          return;
        }
      }
    } catch (err) {
      // Graceful fallback if organization models fail to load
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    const tokenHash = hashToken(refreshToken);

    // Save refresh token hash
    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshTokenCookie(res, refreshToken);

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save();

    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      theme_preference: user.theme_preference,
      createdAt: user.createdAt,
    };

    res.status(200).json({
      user: userResponse,
      accessToken,
    });
  } catch (error: any) {
    console.error('[Auth/Login] Error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies[COOKIE_NAME];
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token missing' });
      return;
    }

    const tokenHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash });

    // Reuse detection
    if (!storedToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        console.warn(`[Auth/Refresh] Potential token reuse detected! Revoking all sessions for user: ${payload.userId}`);
        await RefreshToken.deleteMany({ userId: payload.userId });
      } catch (err) {
        // Token was invalid anyway, do nothing
      }
      res.clearCookie(COOKIE_NAME, { path: '/' });
      res.status(403).json({ error: 'Access denied: Token revoked' });
      return;
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      // Invalid token, remove from db
      await RefreshToken.deleteOne({ _id: storedToken._id });
      res.clearCookie(COOKIE_NAME, { path: '/' });
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      await RefreshToken.deleteOne({ _id: storedToken._id });
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Rotate: Issue new access & refresh tokens
    const newAccessToken = generateAccessToken(user.id, user.email);
    const newRefreshToken = generateRefreshToken(user.id);
    const newHash = hashToken(newRefreshToken);

    // Instead of deleting immediately, set a short grace period (e.g. 15 seconds)
    // to allow any pending parallel requests or HMR reloads to complete using this token.
    storedToken.expiresAt = new Date(Date.now() + 15000);
    await storedToken.save();

    await RefreshToken.create({
      userId: user._id,
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshTokenCookie(res, newRefreshToken);

    res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error: any) {
    console.error('[Auth/Refresh] Error:', error);
    res.status(500).json({ error: 'Internal server error during token refresh' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies[COOKIE_NAME];
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await RefreshToken.deleteOne({ tokenHash });
    }

    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('[Auth/Logout] Error:', error);
    res.status(500).json({ error: 'Internal server error during logout' });
  }
};

export const ssoCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name } = req.body;
    if (!email || !name) {
      res.status(400).json({ error: 'SSO payload requires email and name' });
      return;
    }

    const emailClean = email.toLowerCase().trim();
    let user = await User.findOne({ email: emailClean });

    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      // JIT user provisioning: create user with secure random password
      user = new User({
        name,
        email: emailClean,
        passwordHash: Math.random().toString(36).substring(2, 15) // placeholder
      });
      await user.save();
    }

    // Domain-based auto-join check (Module Org SSO JIT Requirement)
    const emailDomain = emailClean.split('@')[1];
    const { OrgSSOConfig, OrganizationMembership, AuditEvent } = require('../workspaces/organization.model');
    
    // Find all SSO configs matching this domain
    const configs = await OrgSSOConfig.find({ verified_domains: emailDomain, sso_enabled: true });
    for (const ssoConf of configs) {
      // Check if user is already a member
      const existingMember = await OrganizationMembership.findOne({
        user: user._id,
        organization: ssoConf.organizationId
      });

      if (!existingMember) {
        console.log(`[JIT] Auto-adding user ${user.email} to Org: ${ssoConf.organizationId} via domain match`);
        const membership = new OrganizationMembership({
          user: user._id,
          organization: ssoConf.organizationId,
          role: 'member'
        });
        await membership.save();

        // Write Audit Log
        const audit = new AuditEvent({
          organizationId: ssoConf.organizationId,
          actorId: user._id,
          action_type: 'member_auto_joined_sso',
          target_object: user.email,
          metadata: { emailDomain }
        });
        await audit.save();
      }
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);
    const tokenHash = hashToken(refreshToken);

    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    setRefreshTokenCookie(res, refreshToken);

    res.json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isNewUser
      }
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message || 'SSO Callback failed.' });
  }
};
