import { Injectable, BeforeApplicationShutdown } from '@nestjs/common';
import { Readable } from 'stream';
import { Message } from '../messages/messages.model';
import { TextChannel, VoiceChannel } from 'discord.js';
import {
  AudioPlayer,
  AudioPlayerState,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  VoiceConnection,
} from '@discordjs/voice';

const TIMEOUT_INTERVAL = 30000;
const DEFAULT_VOLUME = 0.2;
@Injectable()
export class AudioService implements BeforeApplicationShutdown {
  private _audioConnections = new Map<string, AudioResource>();
  private _leaveTimer = new Map<string, any>();
  private _channels = new Map<string, VoiceConnection>();

  async beforeApplicationShutdown() {
    [...this._channels.entries()].forEach(([, c]) => {
      c.destroy();
    });
  }

  getPlayer(message: Message) {
    switch (message.channel) {
      case 'discord': {
        const guild = (message.messageChannel as TextChannel).guild;
        if (!guild) {
          throw new Error('Not in a guild');
        }
        const key = `discord: ${guild.id}`;
        return this._audioConnections.get(key);
      }
      default: {
        return undefined;
      }
    }
  }

  private _volumes = new Map<string, number>();

  isPlaying(message: Message) {
    switch (message.channel) {
      case 'discord': {
        const guild = (message.messageChannel as TextChannel).guild;
        if (!guild) {
          throw new Error('Not in a guild');
        }
        const key = `discord: ${guild.id}`;
        return (
          this._audioConnections.get(key)?.audioPlayer?.state.status ===
          AudioPlayerStatus.Playing
        );
      }
      default: {
        return false;
      }
    }
  }

  async playAudio(
    message: Message,
    stream: Readable | string,
    volume?: number,
    seek?: number,
    bitrate?: number,
  ): Promise<AudioResource> {
    switch (message.channel) {
      case 'discord':
        const guild = (message.messageChannel as TextChannel).guild;
        if (!guild) {
          throw new Error('Not in a guild');
        }
        const key = `discord: ${guild.id}`;
        if (this._leaveTimer.has(key)) {
          clearTimeout(this._leaveTimer.get(key));
        }
        const vc = (await guild.members.fetch(message.senderId)).voice;
        const conn = joinVoiceChannel({
          channelId: vc.channelId,
          guildId: vc.guild.id,
          adapterCreator: vc.guild.voiceAdapterCreator as any,
        });
        this._channels.set(key, conn);
        let resource = this._audioConnections.get(key);

        resource = createAudioResource(stream, { inlineVolume: true });
        if (!this.isPlaying(message)) {
          const player = createAudioPlayer();

          player.play(resource);
          conn.subscribe(player);

          this._audioConnections.set(key, resource);

          player.on('stateChange', (_, { status }) => {
            switch (status) {
              case AudioPlayerStatus.Playing: {
                resource.volume?.setVolume(
                  this._volumes.has(key)
                    ? this._volumes.get(key)
                    : volume || DEFAULT_VOLUME,
                );
                break;
              }
              case AudioPlayerStatus.Idle: {
                this._leaveTimer.set(
                  key,
                  setTimeout(() => {
                    this._channels.delete(key);
                    conn.destroy();
                  }, TIMEOUT_INTERVAL),
                );
                break;
              }
            }
          });
          resource.playStream.on('end', () => {
            this._audioConnections.delete(key);
          });
        }

        return resource;

        break;
    }
  }

  async changeVolume(message: Message, volume = 0.5) {
    switch (message.channel) {
      case 'discord':
        const guild = (message.messageChannel as TextChannel).guild;
        if (this._audioConnections.has(`discord: ${guild.id}`)) {
          this._audioConnections
            .get(`discord: ${guild.id}`)
            .volume?.setVolume(volume);
        }
        this._volumes.set(`discord: ${guild.id}`, volume);
    }
  }

  async stopPlaying(message: Message) {
    switch (message.channel) {
      case 'discord':
        const guild = (message.messageChannel as TextChannel).guild;
        if (this._audioConnections.has(`discord: ${guild.id}`)) {
          this._audioConnections
            .get(`discord: ${guild.id}`)
            .audioPlayer?.stop(true);
          this._audioConnections.delete(`discord: ${guild.id}`);
        }
    }
  }
}
