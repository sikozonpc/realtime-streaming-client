import { useState, useRef, useCallback, useEffect } from "react"
import { VideoData } from "../screens/room/types"
import ReactPlayer from "react-player"
import useWebsocket, { ActionType } from "hooks/useWebsocket"
import { useParams } from "react-router"
import axios from "axios"
import { WS_URL, API_URL } from "config"


const initialVideoData = {
  time: 0,
  url: "",
  playing: false,
}


export const useRoom = () => {
  const playerRef = useRef<ReactPlayer | null>(null)

  const [videoData, setVideoData] = useState<VideoData>(initialVideoData)
  const [isMediaReady, setMediaReady] = useState(false)
  const [videoUrl, setVideo] = useState("")
  const [playlist, setPlaylist] = useState<string[]>([])
  const stateRef = useRef<VideoData>()

  const { roomID } = useParams<{ roomID: string }>()

  // Hack to fix a callback react variable not updating https://stackoverflow.com/questions/57847594/react-hooks-accessing-up-to-date-state-from-within-a-callback
  stateRef.current = videoData;

  const getPlaylist = useCallback(async () => {
    const { data } = await axios.get<string[]>(`${API_URL}/room/${roomID}/playlist`)
    if (!data) return

    setPlaylist(data)
  }, [roomID])


  useEffect(() => {
    (async () => setTimeout(getPlaylist, 1000))()
  }, [getPlaylist])

  const seekVideo = (durationTime: number) => {
    console.log('seeking to', durationTime);
    if (durationTime > 0 && playerRef?.current) {
      playerRef.current.seekTo(durationTime, 'seconds')
      return
    }

    console.warn("Failed to seek", videoData)
  }

  const messageListener = (ev: MessageEvent) => {
    const res = JSON.parse(ev.data)
    console.log(JSON.parse(ev.data))

    const action: ActionType = res.action

    if (!res || !action) {
      console.warn("No action to handle")
      return
    }

    switch (action) {
      case ActionType.REQUEST: {
        (async () => getPlaylist())()
        console.log(videoData)

        if (!res.data) return

        const isRequestingNewVideo = stateRef.current?.url !== res.data.url
        if (isRequestingNewVideo) return

        syncVideoWithServer(res.data)
        return
      }

      case ActionType.END_VIDEO: {
        return
      }

      case ActionType.SYNC: {
        if (!res.data || !res.data.url) return

        (async () => getPlaylist())()
        syncVideoWithServer(res.data)
        seekVideo(res.data.time)
        return
      }

      case ActionType.PLAY_VIDEO: {
        if (!res.data) return

        syncVideoWithServer(res.data)
        seekVideo(res.data.time)
        return
      }

      case ActionType.PAUSE_VIDEO: {
        if (!res.data) return
        syncVideoWithServer(res.data)
        return
      }

      default: return console.log("Nothing", res.data)
    }
  }

  const { sendMessage } = useWebsocket(`${WS_URL}/ws/${roomID}`, messageListener)

  const handleRequestVideo = () => {
    sendMessage({
      action: ActionType.REQUEST,
      data: {
        url: videoUrl,
      }
    })

    if (!videoData.url) {
      setVideoData({
        url: videoUrl,
      })
    }
  }

  const syncVideoWithServer = useCallback((newVideoData: VideoData) => {
    setVideoData({
      url: newVideoData.url,
      time: newVideoData.time,
      playing: newVideoData.playing,
    })
  }, [])

  const handlePlay = () => {
    if (!playerRef?.current || videoData.playing) return;

    sendMessage({
      action: ActionType.PLAY_VIDEO,
      data: {
        time: playerRef.current.getCurrentTime(),
        url: videoData.url,
        playing: true,
      }
    });
  }

  const handlePause = () => {
    if (!playerRef?.current) return;

    console.log('SEND')
    sendMessage({
      action: ActionType.PAUSE_VIDEO,
      data: {
        url: videoData.url,
        playing: false,
      }
    });
  }

  const handleSeek = () => {
    sendMessage({
      action: ActionType.PLAY_VIDEO,
      data: {
        time: playerRef?.current?.getCurrentTime() || 0,
        url: videoData.url,
        playing: true,
      }
    });
  }

  const handleMediaEnd = () => {
    sendMessage({
      action: ActionType.END_VIDEO,
      data: {}
    })
  }

  const handleMediaReady = (_player: ReactPlayer) => {
    setMediaReady(true)
  }

  return {
    isMediaReady,
    videoData,
    playerRef,
    videoUrl,
    playlist,

    handleMediaEnd,
    handleMediaReady,
    handleSeek,
    handlePause,
    handlePlay,
    handleRequestVideo,
    setVideo,
    syncVideoWithServer,
  }
}
