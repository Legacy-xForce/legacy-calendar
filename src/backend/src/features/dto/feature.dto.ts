import { ApiProperty } from '@nestjs/swagger';

export class FeatureDto {
    @ApiProperty({ type: Number, example: 1 })
    id!: number;

    @ApiProperty({ type: String, example: 'Sleep', description: 'Display name' })
    name!: string;

    @ApiProperty({ type: String, example: '🌙', description: 'Emoji shown next to the feature' })
    emoji!: string;
}
