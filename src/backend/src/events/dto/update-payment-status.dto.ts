import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePaymentStatusDto {
    @ApiProperty({ type: Boolean, example: true, description: 'Whether the participant has paid' })
    @IsBoolean()
    hasPaid!: boolean;
}
