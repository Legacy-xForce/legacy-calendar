import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsDate,
    IsNotEmpty,
    Validate,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface
} from 'class-validator';

const MAX_RANGE_DAYS = 366;

@ValidatorConstraint({ name: 'eventRange', async: false })
class EventRangeConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments) {
        const dto = args.object as FindEventsQueryDto;
        if (!(dto.start instanceof Date) || !(dto.end instanceof Date)) return false;
        const span = dto.end.getTime() - dto.start.getTime();
        return span >= 0 && span <= MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
    }

    defaultMessage() {
        return `end must be after start and the range must not exceed ${MAX_RANGE_DAYS} days`;
    }
}

export class FindEventsQueryDto {
    @ApiProperty({
        type: Date,
        example: '2026-04-01T00:00:00.000Z',
        description: 'Start of the visible calendar range, inclusive'
    })
    @IsNotEmpty()
    @Type(() => Date)
    @IsDate()
    start!: Date;

    @ApiProperty({
        type: Date,
        example: '2026-05-03T23:59:59.999Z',
        description: 'End of the visible calendar range, inclusive'
    })
    @IsNotEmpty()
    @Type(() => Date)
    @IsDate()
    @Validate(EventRangeConstraint)
    end!: Date;
}
