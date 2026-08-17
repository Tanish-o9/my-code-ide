import { Router } from 'express';
import { DockerController } from './docker.controller';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';

const router = Router({ mergeParams: true });

router.get('/containers', requireWorkspaceAccess('viewer') as any, DockerController.getContainers as any);
router.get('/images', requireWorkspaceAccess('viewer') as any, DockerController.getImages as any);
router.get('/volumes', requireWorkspaceAccess('viewer') as any, DockerController.getVolumes as any);
router.get('/networks', requireWorkspaceAccess('viewer') as any, DockerController.getNetworks as any);

router.post('/containers/:id/control', requireWorkspaceAccess('editor') as any, DockerController.controlContainer as any);
router.get('/containers/:id/logs', requireWorkspaceAccess('viewer') as any, DockerController.getContainerLogs as any);
router.post('/pull', requireWorkspaceAccess('editor') as any, DockerController.pullImage as any);
router.post('/build', requireWorkspaceAccess('editor') as any, DockerController.buildImage as any);
router.post('/compose', requireWorkspaceAccess('editor') as any, DockerController.composeAction as any);

export default router;
