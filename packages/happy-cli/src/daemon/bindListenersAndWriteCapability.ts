import { configuration } from '@/configuration';
import { dualListenerBinding, type DualListenerBindingOptions, type DualListenerBindingHandle } from './dualListenerBinding';
import { writeLoopbackCapability } from './loopbackCapability';

export async function bindListenersAndWriteCapability(
  options: DualListenerBindingOptions,
  happyHomeDir = configuration.happyHomeDir,
): Promise<DualListenerBindingHandle> {
  const listenerBinding = await dualListenerBinding(options);
  try {
    await writeLoopbackCapability(happyHomeDir);
  } catch (error) {
    await listenerBinding.stop();
    throw error;
  }
  return listenerBinding;
}
