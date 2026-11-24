import { Injectable } from '@nestjs/common';

import ffmpeg from 'fluent-ffmpeg';
import { AppLogger } from '../logging/app-logger.js';

@Injectable()
export class MediaProcessorService {
    private readonly logger = new AppLogger(MediaProcessorService.name);
    private readonly timeoutMs = 300_000;

    async processImage(inputPath: string, outputPath: string): Promise<void> {
        this.logger.debug('Processing chat image', { inputPath, outputPath });
        await new Bun.Image(inputPath)
            .resize(1920, 1920, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .write(outputPath);
    }

    async processVideo(inputPath: string, outputPath: string): Promise<void> {
        this.logger.debug('Processing chat video', { inputPath, outputPath });
        return new Promise((resolve, reject) => {
            let settled = false;
            const state: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined };
            const settle = (finish: () => void) => {
                if (settled) return;
                settled = true;
                if (state.timer) clearTimeout(state.timer);
                finish();
            };

            const command = ffmpeg(inputPath)
                .outputOptions([
                    '-vcodec libx264',
                    '-crf 28',
                    '-preset fast',
                    '-vf scale=w=1280:h=720:force_original_aspect_ratio=decrease',
                    '-acodec aac'
                ])
                .toFormat('mp4');

            // A malformed upload can make ffmpeg stall forever, leaving the
            // request hanging and a child process running.
            state.timer = setTimeout(() => {
                this.logger.error('Chat video transcoding timed out', {
                    inputPath,
                    outputPath,
                    timeoutMs: this.timeoutMs
                });
                command.kill('SIGKILL');
                settle(() => reject(new Error('Video transcoding timed out')));
                void this.removePartialOutput(outputPath);
            }, this.timeoutMs);

            command
                .on('error', (err) => {
                    this.logger.error('Error processing video', err);
                    settle(() => reject(err));
                    void this.removePartialOutput(outputPath);
                })
                .on('end', () => {
                    this.logger.info('Chat video processed', { inputPath, outputPath });
                    settle(() => resolve());
                })
                .save(outputPath);
        });
    }

    private async removePartialOutput(outputPath: string) {
        const f = Bun.file(outputPath);
        if (await f.exists()) {
            await f.delete();
        }
    }
}
