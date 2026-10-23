import { uploadSiteAsset } from '@/modules/web-sites/services/site-asset-upload';
export async function POST(req: Request) { return uploadSiteAsset(req, 'store'); }
