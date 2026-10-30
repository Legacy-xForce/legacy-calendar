import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CreateFeatureDto, Feature, UpdateFeatureDto } from '../types/Event';
import api from '../services/API';
import { createLogger } from '../services/logger';

const logger = createLogger('FeaturesStore');

/** The instance's selectable features (name + emoji), managed by admins. */
export const useFeaturesStore = defineStore('features', () => {
    const features = ref<Feature[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function fetchFeatures() {
        loading.value = true;
        error.value = null;
        try {
            const res = await api.getFeatures();
            features.value = res.data;
        } catch (err: any) {
            error.value = err.response?.data?.message || 'Failed to load features';
            logger.error('Failed to load features', err);
        } finally {
            loading.value = false;
        }
        return features.value;
    }

    async function createFeature(dto: CreateFeatureDto) {
        const res = await api.createFeature(dto);
        features.value.push(res.data);
        return res.data;
    }

    async function updateFeature(id: number, dto: UpdateFeatureDto) {
        const res = await api.updateFeature(id, dto);
        const index = features.value.findIndex((feature) => feature.id === id);
        if (index !== -1) features.value[index] = res.data;
        return res.data;
    }

    async function deleteFeature(id: number) {
        await api.deleteFeature(id);
        features.value = features.value.filter((feature) => feature.id !== id);
    }

    return { features, loading, error, fetchFeatures, createFeature, updateFeature, deleteFeature };
});
