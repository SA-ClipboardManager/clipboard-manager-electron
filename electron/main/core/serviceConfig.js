import {CloudService} from '../modules/cloud/CloudService.js';

export const serviceConfig = {
    CloudService: (app) => new CloudService(app),
};