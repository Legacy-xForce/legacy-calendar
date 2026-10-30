import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// One emoji, possibly a ZWJ sequence, flag or keycap, but no other text.
export const SINGLE_EMOJI_PATTERN =
    /^(?:\p{Regional_Indicator}{2}|[0-9#*]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)$/u;

export class CreateFeatureDto {
    @ApiProperty({ type: String, example: 'Karaoke', description: 'Feature name, unique ignoring case' })
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(32)
    name!: string;

    @ApiProperty({ type: String, example: '🎤', description: 'A single emoji, unique across features' })
    @Transform(trim)
    @IsString()
    @Matches(SINGLE_EMOJI_PATTERN, { message: 'emoji must be a single emoji' })
    emoji!: string;
}
