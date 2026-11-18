import { ApiProperty } from '@nestjs/swagger';

/** Metadata only: the raw URL is never returned here, only when it is minted. */
export class CalendarFeedResponseDto {
    @ApiProperty({ type: Number, example: 1, description: 'Feed link id' })
    id!: number;

    @ApiProperty({
        type: String,
        example: 'legacy-calendar-feed-01a1…1289',
        description: 'Non-secret hint that identifies the link'
    })
    tokenHint!: string;

    @ApiProperty({ type: Date, description: 'When the link was created or last rotated' })
    createdAt!: Date;
}

export class CreatedCalendarFeedResponseDto extends CalendarFeedResponseDto {
    @ApiProperty({
        type: String,
        example: 'legacy-calendar-feed-01a15968-64aa-707d-8904-a6a408611289',
        description:
            'The full secret token. Append it to /calendar-feed/feed/ to build the URL. Shown only once; store it immediately.'
    })
    token!: string;
}

export class CalendarFeedDeletedResponseDto {
    @ApiProperty({ type: Boolean, example: true })
    success!: boolean;
}
