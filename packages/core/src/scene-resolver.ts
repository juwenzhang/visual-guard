import type {SceneConfig, ViewportConfig, VisualGuardConfig} from '@visual-guard/shared';
import {generateSceneUrl} from '@visual-guard/shared';

/**
 * 解析后的场景（viewport × scene 笛卡尔积展开后的最小执行单元）
 */
export interface ResolvedScene {
  /** 场景配置 */
  scene: SceneConfig;
  /** 视口配置 */
  viewport: ViewportConfig;
  /** 完整 URL */
  url: string;
  /** 唯一标识：sceneId@viewportName */
  id: string;
  /** 在场景列表中的索引 */
  sceneIndex: number;
  /** 在视口列表中的索引 */
  viewportIndex: number;
}

/**
 * 将配置中的场景列表 × 视口列表做笛卡尔积展开
 *
 * @param config - 经过校验的完整配置
 * @returns 所有需要执行的场景组合
 */
export function resolveScenes(config: VisualGuardConfig): ResolvedScene[] {
  const viewports = config.viewport ?? [{name: 'default', width: 1280, height: 800}];
  const resolved: ResolvedScene[] = [];

  for (const [si, scene] of config.scenarios.entries()) {
    for (const [vi, viewport] of viewports.entries()) {
      resolved.push({
        scene,
        viewport,
        url: generateSceneUrl(config.baseUrl, scene),
        id: `${scene.id}@${viewport.name}`,
        sceneIndex: si,
        viewportIndex: vi
      });
    }
  }

  return resolved;
}
